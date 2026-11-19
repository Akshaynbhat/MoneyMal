import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getAccountDetail } from '../services/api';
import { Icon, Verdict, Role, Score, EmptyState } from './ui';
import { formatINR, patternLabel } from '../lib/format';

const FLAG_DESCRIPTIONS = {
    'F1': '≥90% of received funds re-transmitted within 2 hours',
    'F2': 'Dormant account suddenly active (180+ day gap)',
    'F3': '50+ small deposits from 25+ unique sources',
    'F4': 'Total volume exceeds 200× dataset median',
    'F5': '4+ outbound transfers within 1 hour of receiving',
    'F6': 'Shares receiver pattern with 3+ other accounts',
    'F7': 'Low-value account profile with outlier transactions',
    'F8': 'New account (< 7 days) with high-value activity',
    'F9': 'New account (< 7 days) with high-velocity activity',
    'F10': 'Member of detected cycle of length ≥ 4',
    'AT_BREACH': 'Account-type threshold exceeded'
};

/* Inspector tiers are unchanged from the original panel: ≥ 75 critical, ≥ 40 elevated. */
const tierI = (s) => (s >= 75 ? 'crit' : s >= 40 ? 'warn' : 'low');
const toneI = (s) => (s >= 75 ? 'var(--crit)' : s >= 40 ? 'var(--warn)' : 'var(--pos)');

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'ring', label: 'Ring' },
    { key: 'connected', label: 'Connections' },
    { key: 'ml scores', label: 'Model scores' },
];

function Section({ title, meta, children, pad = true }) {
    return (
        <section className="panel" style={{ overflow: 'hidden' }}>
            <div className="panel-head" style={{ minHeight: 42, padding: '10px 14px' }}>
                <span className="label" style={{ color: 'var(--ink-2)' }}>{title}</span>
                {meta && <span className="panel-meta">{meta}</span>}
            </div>
            {pad ? <div style={{ padding: '6px 14px 8px' }}>{children}</div> : children}
        </section>
    );
}

export function DrawerShell({ onClose, children, label }) {
    return (
        <motion.div
            className="drawer-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.aside
                className="drawer"
                role="dialog"
                aria-modal="true"
                aria-label={label}
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </motion.aside>
        </motion.div>
    );
}

export default function NodeInspector({ accountId, onClose, onSelectAccount, result }) {
    const [activeTab, setActiveTab] = useState('overview');
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [txSort, setTxSort] = useState({ column: 'timestamp', direction: 'desc' });

    // Close on Escape key press
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Fetch account details on mount and when accountId changes
    useEffect(() => {
        let active = true;
        const fetchDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getAccountDetail(accountId);
                if (active) setDetail(data);
            } catch (err) {
                if (active) setError(err?.response?.data?.detail || err.message || 'Failed to fetch details');
            } finally {
                if (active) setLoading(false);
            }
        };
        fetchDetails();
        return () => { active = false; };
    }, [accountId]);

    // Sort Transactions
    const sortedTransactions = useMemo(() => {
        if (!detail?.transactions) return [];
        const txs = [...detail.transactions];
        const { column, direction } = txSort;
        txs.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];
            if (column === 'amount') return direction === 'asc' ? valA - valB : valB - valA;
            valA = String(valA);
            valB = String(valB);
            return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });
        return txs;
    }, [detail?.transactions, txSort]);

    const handleSort = (column) => {
        setTxSort((prev) => ({
            column,
            direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    // Risk explanation, assembled from the engine's patterns and verdict
    const riskExplanation = useMemo(() => {
        if (!detail) return { lines: [], action: null };
        const patterns = detail.patterns || [];
        const decision = detail.decision || 'APPROVE';
        const explanations = [];

        if (patterns.includes('smurfing') || patterns.includes('fan_in')) {
            const numSources = detail.connections?.received_from?.length || 0;
            explanations.push(`Received funds from ${numSources > 0 ? numSources : 'multiple'} unique sources within a short window — consistent with smurfing, where many small deposits are aggregated before being moved to avoid detection.`);
        }
        if (patterns.includes('fan_out')) {
            const numDests = detail.connections?.sent_to?.length || 0;
            explanations.push(`Rapidly distributed funds to ${numDests > 0 ? numDests : 'multiple'} unique recipients — consistent with layering, where money is scattered across many accounts to obscure its origin.`);
        }
        if (patterns.some((p) => p.startsWith('cycle_length_'))) {
            explanations.push('Participates in a circular fund routing pattern where money flows in a loop — a classic laundering technique to simulate legitimate activity.');
        }
        if (patterns.includes('shell_account')) {
            explanations.push('Acts as a pass-through shell — receiving funds and immediately forwarding them while retaining a minimal balance.');
        }
        if (patterns.includes('AT_BREACH') || patterns.includes('threshold_breach')) {
            explanations.push('Breached its account-type transaction threshold, indicating abnormally high-value activity relative to its classification.');
        }
        if (explanations.length === 0) {
            explanations.push('No strong structural fraud patterns; activity falls within standard compliance parameters.');
        }

        let action = null;
        if (decision === 'BLOCK') action = 'Immediately freeze account and escalate to compliance for investigation.';
        else if (decision === 'REVIEW') action = 'Flag for manual analyst review within 24 hours before any large transactions are processed.';

        return { lines: explanations, action };
    }, [detail]);

    // Financial calculations
    const finances = useMemo(() => {
        if (!detail?.transactions) return { sentSum: 0, receivedSum: 0, sentCount: 0, receivedCount: 0, netFlow: 0, firstTx: '—', lastTx: '—', activeDays: 0 };
        let sentSum = 0, receivedSum = 0, sentCount = 0, receivedCount = 0;
        let earliest = null, latest = null;

        detail.transactions.forEach((tx) => {
            const ts = new Date(tx.timestamp);
            if (!earliest || ts < earliest) earliest = ts;
            if (!latest || ts > latest) latest = ts;
            if (tx.direction === 'sent') { sentSum += tx.amount; sentCount++; }
            else { receivedSum += tx.amount; receivedCount++; }
        });

        const activeDays = earliest && latest
            ? Math.max(1, Math.round(Math.abs(latest - earliest) / (1000 * 60 * 60 * 24)))
            : 0;

        return {
            sentSum, receivedSum, sentCount, receivedCount,
            netFlow: receivedSum - sentSum,
            firstTx: earliest ? earliest.toLocaleString('en-IN') : '—',
            lastTx: latest ? latest.toLocaleString('en-IN') : '—',
            activeDays
        };
    }, [detail?.transactions]);

    const sortInd = (col) => txSort.column === col ? (txSort.direction === 'desc' ? '▼' : '▲') : '↕';
    const hasRing = detail?.ring_id && detail.ring_id !== 'NONE';

    return (
        <DrawerShell onClose={onClose} label={`Account ${accountId}`}>
            {loading && (
                <>
                    <div className="drawer-head">
                        <div className="label">Account file</div>
                        <div className="skeleton" style={{ height: 22, width: '55%', marginTop: 10 }} />
                        <div className="skeleton" style={{ height: 14, width: '35%', marginTop: 10 }} />
                        <button className="btn btn-ghost btn-icon drawer-close" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
                    </div>
                    <div className="drawer-body">
                        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
                    </div>
                </>
            )}

            {error && !loading && (
                <>
                    <div className="drawer-head">
                        <div className="label">Account file</div>
                        <div className="mono" style={{ fontSize: '1.1rem', marginTop: 6 }}>{String(accountId)}</div>
                        <button className="btn btn-ghost btn-icon drawer-close" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
                    </div>
                    <EmptyState icon="alert" title="Could not load this account" action={<button className="btn" onClick={onClose}>Close</button>}>
                        {error}
                    </EmptyState>
                </>
            )}

            {!loading && !error && detail && (
                <>
                    {/* Header */}
                    <div className="drawer-head" style={{ paddingBottom: 0 }}>
                        <button className="btn btn-ghost btn-icon drawer-close" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
                        <div className="label">Account file</div>
                        <div className="flex items-start justify-between gap-4" style={{ marginTop: 6, marginRight: 32 }}>
                            <div style={{ minWidth: 0 }}>
                                <h2 className="mono" style={{ fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{detail.account_id}</h2>
                                <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
                                    <Verdict value={detail.decision} />
                                    <Role value={detail.role} />
                                    {hasRing ? (
                                        <button className="tag sage" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('ring')}>{detail.ring_id}</button>
                                    ) : <span className="tag muted">No ring</span>}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div className="num" style={{ fontSize: '2rem', lineHeight: 1, color: toneI(detail.suspicion_score), letterSpacing: '-0.04em' }}>
                                    {Math.round(detail.suspicion_score)}
                                </div>
                                <div className="label" style={{ marginTop: 4 }}>Score / 100</div>
                            </div>
                        </div>
                        <div className="tabs" style={{ marginTop: 16, borderBottom: 0 }}>
                            {TABS.map((t) => (
                                <button key={t.key} className={`tab ${activeTab === t.key ? 'on' : ''}`} onClick={() => setActiveTab(t.key)}>
                                    {t.label}
                                    {t.key === 'transactions' && <span className="cnt">{detail.transactions?.length || 0}</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="drawer-body">
                        {/* OVERVIEW */}
                        {activeTab === 'overview' && (
                            <>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div className={`sev-rail ${tierI(detail.suspicion_score) === 'low' ? 'pos' : tierI(detail.suspicion_score)}`} />
                                    <div>
                                        <div className="label" style={{ marginBottom: 6 }}>Forensic brief</div>
                                        <p style={{ fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--ink)' }}>{riskExplanation.lines.join(' ')}</p>
                                        {riskExplanation.action && (
                                            <p style={{ fontSize: '0.8rem', lineHeight: 1.55, color: 'var(--ink-2)', marginTop: 8 }}>
                                                <span style={{ color: toneI(detail.suspicion_score), fontWeight: 500 }}>Recommended action — </span>{riskExplanation.action}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <Section title="Profile">
                                    <dl className="kv">
                                        <dt>Fraud score</dt>
                                        <dd><Score value={detail.suspicion_score} tier={tierI(detail.suspicion_score)} width={90} /></dd>
                                        <dt>Decision</dt><dd><Verdict value={detail.decision} /></dd>
                                        <dt>Role</dt><dd className="mono">{detail.role}</dd>
                                        <dt>Ring</dt><dd className="mono">{detail.ring_id}</dd>
                                        <dt>Patterns</dt>
                                        <dd>
                                            <div className="flex flex-wrap gap-1">
                                                {detail.patterns?.length > 0 ? detail.patterns.map((p) => <span key={p} className="pattern-chip">{patternLabel(p)}</span>) : <span style={{ color: 'var(--ink-3)' }}>None</span>}
                                            </div>
                                        </dd>
                                        <dt>Flag hits</dt>
                                        <dd>
                                            <div className="flex flex-wrap gap-1">
                                                {detail.flag_hits?.length > 0 ? detail.flag_hits.map((f) => <span key={f} className="tag crit" title={FLAG_DESCRIPTIONS[f]}>{f}</span>) : <span style={{ color: 'var(--ink-3)' }}>None</span>}
                                            </div>
                                        </dd>
                                    </dl>
                                </Section>

                                <Section title="Financial summary">
                                    <dl className="kv">
                                        <dt>Total sent</dt><dd className="num">{formatINR(finances.sentSum)}</dd>
                                        <dt>Total received</dt><dd className="num">{formatINR(finances.receivedSum)}</dd>
                                        <dt>Net flow</dt>
                                        <dd className="num" style={{ color: finances.netFlow < 0 ? 'var(--crit)' : 'var(--pos)' }}>
                                            {finances.netFlow > 0 ? '+' : ''}{formatINR(finances.netFlow)}
                                        </dd>
                                        <dt>Transactions</dt><dd className="num">{finances.sentCount} sent · {finances.receivedCount} received</dd>
                                        <dt>First seen</dt><dd className="mono" style={{ fontSize: '0.76rem' }}>{finances.firstTx}</dd>
                                        <dt>Last seen</dt><dd className="mono" style={{ fontSize: '0.76rem' }}>{finances.lastTx}</dd>
                                        <dt>Active period</dt><dd className="num">{finances.activeDays} day{finances.activeDays !== 1 ? 's' : ''}</dd>
                                    </dl>
                                </Section>
                            </>
                        )}

                        {/* TRANSACTIONS */}
                        {activeTab === 'transactions' && (
                            <>
                                <div className="metric-strip" style={{ '--cols': 2, '--cols-md': 2 }}>
                                    <div className="metric" style={{ padding: '12px 14px' }}>
                                        <div className="metric-k">Sent · {finances.sentCount}</div>
                                        <div className="metric-v" style={{ fontSize: '1.05rem', marginTop: 6 }}>{formatINR(finances.sentSum)}</div>
                                    </div>
                                    <div className="metric" style={{ padding: '12px 14px' }}>
                                        <div className="metric-k">Received · {finances.receivedCount}</div>
                                        <div className="metric-v" style={{ fontSize: '1.05rem', marginTop: 6 }}>{formatINR(finances.receivedSum)}</div>
                                    </div>
                                </div>

                                <section className="panel" style={{ overflow: 'hidden' }}>
                                    <div className="table-wrap" style={{ maxHeight: 'calc(100dvh - 330px)' }}>
                                        <table className="data-table compact" style={{ fontSize: '0.78rem' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ paddingLeft: 14 }}>Tx</th>
                                                    <th>Counterparty</th>
                                                    <th className={`r sortable ${txSort.column === 'amount' ? 'sorted' : ''}`} onClick={() => handleSort('amount')}>Amount<span className="sort-ind">{sortInd('amount')}</span></th>
                                                    <th className={`sortable ${txSort.column === 'timestamp' ? 'sorted' : ''}`} onClick={() => handleSort('timestamp')}>Time<span className="sort-ind">{sortInd('timestamp')}</span></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedTransactions.map((tx) => (
                                                    <tr key={tx.transaction_id} style={tx.is_ring_transaction ? { background: 'rgba(232,103,92,0.05)' } : undefined}>
                                                        <td style={{ paddingLeft: 14 }}>
                                                            <span className="mono dim" style={{ fontSize: '0.72rem' }} title={tx.transaction_id}>…{tx.transaction_id.slice(-6)}</span>
                                                        </td>
                                                        <td>
                                                            <span className="flex items-center gap-2">
                                                                <span style={{ color: tx.direction === 'sent' ? 'var(--crit)' : 'var(--pos)', width: 12 }} title={tx.direction}>
                                                                    {tx.direction === 'sent' ? '→' : '←'}
                                                                </span>
                                                                <button className="link-id" onClick={() => onSelectAccount(tx.counterparty)}>{tx.counterparty}</button>
                                                                {tx.is_ring_transaction && <span className="tag crit" style={{ height: 17, fontSize: '0.6rem' }}>Ring</span>}
                                                            </span>
                                                        </td>
                                                        <td className="r num" style={{ color: tx.is_ring_transaction ? 'var(--crit)' : 'var(--ink)' }}>{formatINR(tx.amount)}</td>
                                                        <td className="mono dim" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{tx.timestamp}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {sortedTransactions.length === 0 && <EmptyState title="No transactions">This account has no recorded transfers.</EmptyState>}
                                    </div>
                                </section>
                            </>
                        )}

                        {/* RING */}
                        {activeTab === 'ring' && (
                            !detail.ring_details ? (
                                <EmptyState icon="target" title="Not part of any fraud ring">This account was not grouped into a coordinated ring by the engine.</EmptyState>
                            ) : (
                                <>
                                    <Section title="Fraud ring" meta={<span className="mono">{detail.ring_details.ring_id}</span>}>
                                        <dl className="kv">
                                            <dt>Pattern</dt><dd style={{ textTransform: 'capitalize' }}>{detail.ring_details.pattern_type}</dd>
                                            <dt>Risk score</dt><dd><Score value={detail.ring_details.risk_score} tier="crit" width={90} /></dd>
                                            <dt>Recommendation</dt><dd><Verdict value={detail.ring_details.recommendation} /></dd>
                                            <dt>Loop volume</dt><dd className="num">{formatINR(detail.ring_details.total_amount)}</dd>
                                            <dt>Ring transfers</dt><dd className="num">{detail.ring_details.tx_count}</dd>
                                            <dt>Members</dt><dd className="num">{detail.ring_details.members.length} accounts</dd>
                                        </dl>
                                    </Section>

                                    <Section title="Structural flow">
                                        <RingFlow ring={detail.ring_details} selfId={detail.account_id} />
                                    </Section>

                                    <Section title="Members" meta={`${detail.ring_details.members.length}`} pad={false}>
                                        <table className="data-table compact" style={{ fontSize: '0.78rem' }}>
                                            <thead><tr><th style={{ paddingLeft: 14 }}>Account</th><th>Role</th><th className="r">Score</th><th>Verdict</th></tr></thead>
                                            <tbody>
                                                {detail.ring_details.members.map((m) => {
                                                    const isSelf = m.account_id === detail.account_id;
                                                    return (
                                                        <tr key={m.account_id} className="clickable" onClick={() => onSelectAccount(m.account_id)} style={isSelf ? { background: 'var(--sage-bg)' } : undefined}>
                                                            <td style={{ paddingLeft: 14 }} className="id">{m.account_id}{isSelf && <span className="tag sage" style={{ marginLeft: 8, height: 17, fontSize: '0.6rem' }}>this</span>}</td>
                                                            <td className="mono dim" style={{ fontSize: '0.72rem' }}>{m.role}</td>
                                                            <td className="r num">{m.score.toFixed(1)}</td>
                                                            <td><Verdict value={m.decision} /></td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </Section>
                                </>
                            )
                        )}

                        {/* CONNECTED */}
                        {activeTab === 'connected' && (() => {
                            const allConns = [...detail.connections.sent_to, ...detail.connections.received_from];
                            const maxSusp = allConns.length ? allConns.reduce((a, b) => (a.score > b.score ? a : b)) : null;
                            const totalExposure = allConns
                                .filter((c) => c.decision === 'BLOCK' || c.decision === 'REVIEW')
                                .reduce((sum, c) => sum + c.total_amount, 0);

                            const renderConnectionTable = (title, items) => (
                                <Section title={title} meta={`${items.length} accounts`} pad={false}>
                                    {items.length === 0 ? (
                                        <div style={{ padding: '14px', fontSize: '0.8rem', color: 'var(--ink-3)' }}>No accounts.</div>
                                    ) : (
                                        <div className="table-wrap" style={{ maxHeight: 320 }}>
                                            <table className="data-table compact" style={{ fontSize: '0.78rem' }}>
                                                <thead><tr><th style={{ paddingLeft: 14 }}>Account</th><th className="r">Amount</th><th className="r">Txns</th><th className="r">Score</th><th>Verdict</th></tr></thead>
                                                <tbody>
                                                    {items.map((conn) => {
                                                        const isBlock = conn.decision === 'BLOCK';
                                                        const inSameRing = detail.ring_details?.members.some((m) => m.account_id === conn.account_id);
                                                        const rail = isBlock ? 'var(--crit)' : inSameRing ? 'var(--sage)' : 'transparent';
                                                        return (
                                                            <tr key={conn.account_id} className="clickable" onClick={() => onSelectAccount(conn.account_id)}>
                                                                <td style={{ paddingLeft: 14, boxShadow: `inset 2px 0 0 ${rail}` }} className="id">{conn.account_id}</td>
                                                                <td className="r num">{formatINR(conn.total_amount)}</td>
                                                                <td className="r num">{conn.tx_count}</td>
                                                                <td className="r num" style={{ color: toneI(conn.score) }}>{conn.score.toFixed(0)}</td>
                                                                <td><Verdict value={conn.decision} /></td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </Section>
                            );

                            return (
                                <>
                                    <dl className="kv panel" style={{ padding: '4px 14px' }}>
                                        <dt>Counterparties</dt>
                                        <dd>Sent to <span className="num">{detail.connections.sent_to.length}</span> · received from <span className="num">{detail.connections.received_from.length}</span></dd>
                                        {maxSusp && <>
                                            <dt>Most suspicious</dt>
                                            <dd><button className="link-id" onClick={() => onSelectAccount(maxSusp.account_id)}>{maxSusp.account_id}</button> <span className="num" style={{ color: toneI(maxSusp.score), marginLeft: 6 }}>{maxSusp.score.toFixed(0)}</span></dd>
                                            <dt>Flagged exposure</dt>
                                            <dd className="num" style={{ color: totalExposure > 0 ? 'var(--crit)' : 'var(--ink)' }}>{formatINR(totalExposure)}</dd>
                                        </>}
                                    </dl>
                                    <div className="flex gap-4" style={{ fontSize: '0.72rem', color: 'var(--ink-3)', marginTop: -10 }}>
                                        <span className="flex items-center gap-2"><i style={{ width: 2, height: 12, background: 'var(--crit)' }} /> Blocked counterparty</span>
                                        <span className="flex items-center gap-2"><i style={{ width: 2, height: 12, background: 'var(--sage)' }} /> Same ring</span>
                                    </div>
                                    {renderConnectionTable('Sent money to', detail.connections.sent_to)}
                                    {renderConnectionTable('Received money from', detail.connections.received_from)}
                                </>
                            );
                        })()}

                        {/* ML SCORES */}
                        {activeTab === 'ml scores' && (
                            <>
                                <Section title="Weighted scoring equation">
                                    <div style={{ padding: '8px 0 6px' }}>
                                        <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>GAT×25% + LSTM×20% + EIF×30% + Rules×25%</div>
                                        <div className="mono" style={{ fontSize: '0.84rem', marginTop: 8, overflowWrap: 'anywhere' }}>
                                            {detail.ml_scores.GAT}×0.25 + {detail.ml_scores.LSTM}×0.20 + {detail.ml_scores.EIF}×0.30 + {detail.ml_scores.Rules}×0.25 ={' '}
                                            <span style={{ color: toneI(detail.suspicion_score) }}>{detail.suspicion_score.toFixed(1)}</span>
                                        </div>
                                    </div>
                                </Section>

                                <Section title="Pillar breakdown">
                                    {[
                                        { name: 'GAT — graph attention', score: detail.ml_scores.GAT, desc: 'Centrality in the transaction network. High = key node in a ring.' },
                                        { name: 'LSTM — temporal patterns', score: detail.ml_scores.LSTM, desc: 'Timing anomalies. High = burst activity or irregular cadence.' },
                                        { name: 'EIF — isolation forest', score: detail.ml_scores.EIF, desc: 'Outlier detection across 20 behavioural features.' },
                                        { name: 'Rules — RBI / NPCI flags', score: detail.ml_scores.Rules, desc: 'Regulatory rule violations; each triggered rule adds weight.' },
                                    ].map((p, idx, arr) => (
                                        <div key={p.name} style={{ padding: '10px 0', borderBottom: idx < arr.length - 1 ? '1px solid var(--line)' : 0 }}>
                                            <div className="flex items-center justify-between">
                                                <span style={{ fontSize: '0.82rem' }}>{p.name}</span>
                                                <span className="num" style={{ fontSize: '0.8rem', color: toneI(p.score) }}>{p.score}<span style={{ color: 'var(--ink-4)' }}>/100</span></span>
                                            </div>
                                            <div style={{ height: 3, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden', margin: '8px 0 6px' }}>
                                                <div style={{ height: '100%', width: `${p.score}%`, background: toneI(p.score) }} />
                                            </div>
                                            <p style={{ fontSize: '0.74rem', color: 'var(--ink-3)' }}>{p.desc}</p>
                                        </div>
                                    ))}
                                </Section>

                                <Section title="Compliance violations" meta={`${detail.flag_hits?.length || 0}`}>
                                    {detail.flag_hits?.length > 0 ? detail.flag_hits.map((flag, i, arr) => (
                                        <div key={flag} className="flex gap-3" style={{ padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 0, fontSize: '0.8rem' }}>
                                            <span className="tag crit" style={{ minWidth: 44, justifyContent: 'center' }}>{flag}</span>
                                            <span style={{ color: 'var(--ink-2)' }}>{FLAG_DESCRIPTIONS[flag] || flag}</span>
                                        </div>
                                    )) : <div style={{ padding: '8px 0', fontSize: '0.8rem', color: 'var(--ink-3)' }}>No regulatory rule violations found.</div>}
                                </Section>
                            </>
                        )}
                    </div>
                </>
            )}
        </DrawerShell>
    );
}

/* Compact schematic of how funds move through the ring (first members only). */
function RingFlow({ ring, selfId }) {
    const node = (id, key, emphasis) => (
        <span key={key} className="mono" style={{
            fontSize: '0.72rem', padding: '4px 8px', borderRadius: 3,
            border: `1px solid ${emphasis ? 'var(--sage-line)' : 'var(--line-2)'}`,
            background: emphasis ? 'var(--sage-bg)' : 'var(--bg)',
            color: emphasis ? 'var(--sage-strong)' : 'var(--ink)',
            whiteSpace: 'nowrap',
        }}>{id}</span>
    );
    const arrow = (k) => <span key={k} style={{ color: 'var(--ink-4)' }}>→</span>;
    const members = ring.members || [];

    if (ring.pattern_type === 'smurfing') {
        const sources = members.slice(0, 3).filter((m) => m.account_id !== selfId);
        return (
            <div style={{ padding: '8px 0', display: 'grid', gap: 8 }}>
                <div className="flex flex-wrap gap-2 items-center">
                    {sources.map((m, i) => node(m.account_id, `s${i}`))}
                </div>
                <div style={{ color: 'var(--ink-4)', fontSize: '0.75rem', paddingLeft: 4 }}>↓ aggregated into</div>
                <div>{node(`${selfId} · hub`, 'hub', true)}</div>
                {members.length > 4 && <div style={{ fontSize: '0.74rem', color: 'var(--ink-3)' }}>+ {members.length - 4} other mule accounts</div>}
            </div>
        );
    }

    const shown = members.slice(0, 4);
    return (
        <div style={{ padding: '8px 0' }}>
            <div className="flex flex-wrap gap-2 items-center">
                {shown.flatMap((m, i) => {
                    const parts = [node(m.account_id, `n${i}`, m.account_id === selfId)];
                    if (i < shown.length - 1) parts.push(arrow(`a${i}`));
                    return parts;
                })}
                {ring.pattern_type === 'cycle' && shown.length > 0 && <>{arrow('ret')}<span style={{ color: 'var(--ink-3)', fontSize: '0.74rem' }}>back to {shown[0].account_id}</span></>}
            </div>
            {members.length > 4 && <div style={{ fontSize: '0.74rem', color: 'var(--ink-3)', marginTop: 8 }}>+ {members.length - 4} more nodes</div>}
        </div>
    );
}
