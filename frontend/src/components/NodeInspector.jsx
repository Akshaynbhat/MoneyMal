import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getAccountDetail } from '../services/api';

/* ---- Pattern translations for UI ---- */
const PATTERN_LABELS = {
    'F1_FAST_PASSTHROUGH': 'F1: Fast Passthrough',
    'F2_DORMANT_BURST': 'F2: Dormant Burst',
    'F3_MICRO_SMURFING': 'F3: Micro-Smurfing',
    'F4_MACRO_VOLUME_OUTLIER': 'F4: Macro Volume Outlier',
    'F5_RAPID_OUTBOUND': 'F5: Rapid Outbound',
    'F6_COORDINATED_GROUP': 'F6: Coordinated Group',
    'F7_OUTLIER_TXN': 'F7: Outlier Transaction',
    'F8_NEW_ACC_HIGH_VAL': 'F8: New Account High Value',
    'F9_NEW_ACC_HIGH_VELOCITY': 'F9: New Account High Velocity',
    'F10_RAPID_LAYERING': 'F10: Rapid Layering',
    'cycle_length_3': 'Circular Loop (L3)',
    'cycle_length_4': 'Circular Loop (L4)',
    'cycle_length_5': 'Circular Loop (L5)',
    'shell_account': 'Shell Intermediary',
    'smurfing': 'Smurfing Pattern',
    'fan_in': 'Fan-In (Aggregation)',
    'fan_out': 'Fan-Out (Dispersal)',
    'bipartite': 'Coordinated Circular Flow',
    'threshold_breach': 'Limit Threshold Breach',
    'high_velocity': 'High-Velocity Transfer',
    'low_variance': 'Low Variance Pattern'
};

const FLAG_DESCRIPTIONS = {
    'F1': 'F1 → ≥90% of received funds re-transmitted within 2 hours',
    'F2': 'F2 → Dormant account suddenly active (180+ day gap)',
    'F3': 'F3 → 50+ small deposits from 25+ unique sources',
    'F4': 'F4 → Total volume exceeds 200× dataset median',
    'F5': 'F5 → 4+ outbound transfers within 1 hour of receiving',
    'F6': 'F6 → Shares receiver pattern with 3+ other accounts',
    'F7': 'F7 → Low-value account profile with outlier transactions',
    'F8': 'F8 → New account (< 7 days) with high-value activity',
    'F9': 'F9 → New account (< 7 days) with high-velocity activity',
    'F10': 'F10 → Member of detected cycle of length ≥ 4',
    'AT_BREACH': 'AT_BREACH → Account-type threshold exceeded'
};

const getScoreColor = (score) => {
    if (score >= 75) return 'var(--color-risk-red)';
    if (score >= 40) return 'var(--color-risk-orange)';
    return 'var(--color-risk-green)';
};

const getScoreBg = (score) => {
    if (score >= 75) return 'rgba(255, 59, 59, 0.2)';
    if (score >= 40) return 'rgba(255, 159, 28, 0.2)';
    return 'rgba(0, 255, 148, 0.1)';
};

const formatINR = (val) => {
    return Number(val || 0).toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

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
                if (active) {
                    setDetail(data);
                }
            } catch (err) {
                if (active) {
                    setError(err?.response?.data?.detail || err.message || 'Failed to fetch details');
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };
        fetchDetails();
        return () => {
            active = false;
        };
    }, [accountId]);

    // Sort Transactions
    const sortedTransactions = useMemo(() => {
        if (!detail?.transactions) return [];
        const txs = [...detail.transactions];
        const { column, direction } = txSort;

        txs.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            if (column === 'amount') {
                return direction === 'asc' ? valA - valB : valB - valA;
            } else {
                // String comparison (timestamp, transaction_id, etc.)
                valA = String(valA);
                valB = String(valB);
                return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
        });
        return txs;
    }, [detail?.transactions, txSort]);

    const handleSort = (column) => {
        setTxSort((prev) => ({
            column,
            direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    // Dynamic Risk Explanation Generation
    const riskExplanation = useMemo(() => {
        if (!detail) return '';
        const patterns = detail.patterns || [];
        const decision = detail.decision || 'APPROVE';
        const explanations = [];

        const hasSmurfing = patterns.includes('smurfing') || patterns.includes('fan_in');
        if (hasSmurfing) {
            // Count unique senders in connections
            const numSources = detail.connections?.received_from?.length || 0;
            explanations.push(
                `This account received funds from ${numSources > 0 ? numSources : 'multiple'} unique sources within a short window — consistent with smurfing, where many small deposits are aggregated before being moved to avoid detection.`
            );
        }

        if (patterns.includes('fan_out')) {
            const numDests = detail.connections?.sent_to?.length || 0;
            explanations.push(
                `This account rapidly distributed funds to ${numDests > 0 ? numDests : 'multiple'} unique recipients — consistent with layering, where money is scattered across many accounts to obscure its origin.`
            );
        }

        const hasCycle = patterns.some((p) => p.startsWith('cycle_length_'));
        if (hasCycle) {
            explanations.push(
                "This account participates in a circular fund routing pattern where money flows in a loop — a classic money laundering technique to simulate legitimate transaction activity."
            );
        }

        if (patterns.includes('shell_account')) {
            explanations.push(
                "This account acts as a pass-through shell — receiving funds and immediately forwarding them, retaining a minimal balance, consistent with layered laundering."
            );
        }

        const hasBreach = patterns.includes('AT_BREACH') || patterns.includes('threshold_breach');
        if (hasBreach) {
            explanations.push(
                "This account breached its account-type transaction threshold, indicating abnormally high-value activity relative to its account classification."
            );
        }

        if (explanations.length === 0) {
            explanations.push(
                "This account does not display strong structural fraud patterns and falls within standard compliance parameters."
            );
        }

        if (decision === 'BLOCK') {
            explanations.push(
                "Recommended action: Immediately freeze account and escalate to compliance team for investigation."
            );
        } else if (decision === 'REVIEW') {
            explanations.push(
                "Recommended action: Flag for manual analyst review within 24 hours before any large transactions are processed."
            );
        }

        return explanations.join(' ');
    }, [detail]);

    // Financial calculations
    const finances = useMemo(() => {
        if (!detail?.transactions) return { sentSum: 0, receivedSum: 0, sentCount: 0, receivedCount: 0, netFlow: 0, firstTx: '—', lastTx: '—', activeDays: 0 };
        let sentSum = 0;
        let receivedSum = 0;
        let sentCount = 0;
        let receivedCount = 0;
        let earliest = null;
        let latest = null;

        detail.transactions.forEach((tx) => {
            const amt = tx.amount;
            const ts = new Date(tx.timestamp);

            if (!earliest || ts < earliest) earliest = ts;
            if (!latest || ts > latest) latest = ts;

            if (tx.direction === 'sent') {
                sentSum += amt;
                sentCount++;
            } else {
                receivedSum += amt;
                receivedCount++;
            }
        });

        const activeDays = earliest && latest 
            ? Math.max(1, Math.round(Math.abs(latest - earliest) / (1000 * 60 * 60 * 24)))
            : 0;

        return {
            sentSum,
            receivedSum,
            sentCount,
            receivedCount,
            netFlow: receivedSum - sentSum,
            firstTx: earliest ? earliest.toLocaleString('en-IN') : '—',
            lastTx: latest ? latest.toLocaleString('en-IN') : '—',
            activeDays
        };
    }, [detail?.transactions]);

    // Render helper for badges
    const renderDecisionBadge = (decision) => {
        const styles = {
            BLOCK: { bg: 'rgba(255,59,59,0.15)', border: 'var(--color-risk-red)', color: 'var(--color-risk-red)' },
            REVIEW: { bg: 'rgba(255,159,28,0.15)', border: 'var(--color-risk-orange)', color: 'var(--color-risk-orange)' },
            APPROVE: { bg: 'rgba(0,255,148,0.1)', border: 'var(--color-risk-green)', color: 'var(--color-risk-green)' }
        }[decision] || { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', color: '#fff' };

        return (
            <span style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: '20px',
                fontSize: '0.68rem',
                fontWeight: 700,
                backgroundColor: styles.bg,
                border: `1px solid ${styles.border}`,
                color: styles.color,
                fontFamily: 'var(--font-mono)'
            }}>
                {decision}
            </span>
        );
    };

    const renderRoleBadge = (role) => {
        const color = {
            HUB: '#a855f7',
            BRIDGE: '#f97316',
            MULE: '#eab308',
            LEAF: '#3b82f6'
        }[role] || '#8B95A8';

        return (
            <span style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: '6px',
                fontSize: '0.68rem',
                fontWeight: 700,
                backgroundColor: `${color}15`,
                border: `1px solid ${color}40`,
                color: color,
                fontFamily: 'var(--font-mono)'
            }}>
                {role}
            </span>
        );
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 999,
                background: 'rgba(6, 13, 26, 0.40)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                justifyContent: 'flex-end',
            }}
            onClick={onClose}
        >
            <motion.div
                style={{
                    width: '100%',
                    maxWidth: '480px',
                    height: '100vh',
                    background: '#0a1628',
                    backdropFilter: 'blur(20px)',
                    borderLeft: '1px solid rgba(0, 255, 255, 0.15)',
                    boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Loader State */}
                {loading && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="graph-spinner" />
                        <p style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-accent)' }}>
                            LOADING NODE FORENSICS...
                        </p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                        <div style={{ color: 'var(--color-risk-red)', fontSize: '2rem', marginBottom: '16px' }}>✕</div>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-risk-red)', textAlign: 'center' }}>
                            {error}
                        </p>
                        <button className="btn-primary mt-6" style={{ padding: '6px 16px' }} onClick={onClose}>
                            Close
                        </button>
                    </div>
                )}

                {/* Panel Content */}
                {!loading && !error && detail && (
                    <>
                        {/* HEADER */}
                        <div style={{ padding: '24px', borderBottom: '1px solid rgba(0, 245, 255, 0.08)', position: 'relative' }}>
                            {/* Close cross */}
                            <button
                                onClick={onClose}
                                style={{
                                    position: 'absolute', top: 20, right: 20,
                                    background: 'none', border: 'none', color: 'var(--color-text-secondary)',
                                    cursor: 'pointer', fontSize: '1.2rem', transition: 'color 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.color = '#fff'}
                                onMouseLeave={(e) => e.target.style.color = 'var(--color-text-secondary)'}
                            >
                                ✕
                            </button>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginRight: '24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-dim)', letterSpacing: '0.08em' }}>
                                        NODE INSPECTION
                                    </span>
                                    <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-accent)' }}>
                                        {detail.account_id}
                                    </h2>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                        {renderRoleBadge(detail.role)}
                                        {renderDecisionBadge(detail.decision)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                        Ring Membership: {detail.ring_id && detail.ring_id !== 'NONE' ? (
                                            <span
                                                style={{ color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                                                onClick={() => setActiveTab('ring')}
                                            >
                                                {detail.ring_id}
                                            </span>
                                        ) : 'None'}
                                    </div>
                                </div>

                                {/* Fraud Score Circle */}
                                <div style={{
                                    width: '64px',
                                    height: '64px',
                                    borderRadius: '50%',
                                    border: `3px solid ${getScoreColor(detail.suspicion_score)}`,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: getScoreBg(detail.suspicion_score),
                                    boxShadow: `0 0 16px ${getScoreColor(detail.suspicion_score)}30`,
                                }}>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                                        {Math.round(detail.suspicion_score)}
                                    </span>
                                    <span style={{ fontSize: '0.5rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
                                        score
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* TABS HEADER */}
                        <div style={{ display: 'flex', borderBottom: '1px solid rgba(0, 245, 255, 0.08)', background: 'rgba(0,0,0,0.15)' }}>
                            {['overview', 'transactions', 'ring', 'connected', 'ml scores'].map((tab) => {
                                const isActive = activeTab === tab;
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        style={{
                                            flex: 1,
                                            padding: '12px 4px',
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            fontFamily: 'var(--font-mono)',
                                            textTransform: 'uppercase',
                                            background: isActive ? 'rgba(0, 245, 255, 0.04)' : 'transparent',
                                            border: 'none',
                                            borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                                            color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {tab === 'ml scores' ? 'ML Scores' : tab}
                                    </button>
                                );
                            })}
                        </div>

                        {/* TABS CONTAINER */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

                            {/* TAB 1: OVERVIEW */}
                            {activeTab === 'overview' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Core Metrics Grid */}
                                    <div className="glass-card p-4">
                                        <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '12px', letterSpacing: '0.04em' }}>
                                            METADATA PROFILE
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '10px', fontSize: '0.75rem' }}>
                                            <div style={{ color: 'var(--color-text-secondary)' }}>Account ID</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{detail.account_id}</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Decision</div>
                                            <div>{renderDecisionBadge(detail.decision)}</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Fraud Score</div>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{detail.suspicion_score.toFixed(1)}/100</span>
                                                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${detail.suspicion_score}%`, background: getScoreColor(detail.suspicion_score) }} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Role</div>
                                            <div>{renderRoleBadge(detail.role)}</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Ring ID</div>
                                            <div style={{ fontFamily: 'var(--font-mono)' }}>{detail.ring_id}</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Patterns</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {detail.patterns?.length > 0 ? detail.patterns.map((p) => (
                                                    <span key={p} className="pattern-chip">{PATTERN_LABELS[p] || p}</span>
                                                )) : 'None'}
                                            </div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Flag Hits</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {detail.flag_hits?.length > 0 ? detail.flag_hits.map((f) => (
                                                    <span key={f} style={{
                                                        padding: '2px 6px',
                                                        borderRadius: '3px',
                                                        fontFamily: 'var(--font-mono)',
                                                        fontSize: '0.62rem',
                                                        backgroundColor: 'rgba(255, 59, 59, 0.1)',
                                                        border: '1px solid rgba(255, 59, 59, 0.25)',
                                                        color: 'var(--color-risk-red)',
                                                        fontWeight: 'bold'
                                                    }}>{f}</span>
                                                )) : <span style={{ color: 'var(--color-text-dim)', fontStyle: 'italic' }}>None</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Transaction Summary */}
                                    <div className="glass-card p-4">
                                        <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '12px', letterSpacing: '0.04em' }}>
                                            FINANCIAL SUMMARY
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: '8px', fontSize: '0.75rem' }}>
                                            <div style={{ color: 'var(--color-text-secondary)' }}>Total Sent</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatINR(finances.sentSum)}</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Total Received</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatINR(finances.receivedSum)}</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Net Flow</div>
                                            <div style={{
                                                fontFamily: 'var(--font-mono)',
                                                fontWeight: 700,
                                                color: finances.netFlow < 0 ? 'var(--color-risk-red)' : 'var(--color-risk-green)'
                                            }}>
                                                {finances.netFlow > 0 ? '+' : ''}{formatINR(finances.netFlow)}
                                            </div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Sent Count</div>
                                            <div style={{ fontFamily: 'var(--font-mono)' }}>{finances.sentCount} txns</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Received Count</div>
                                            <div style={{ fontFamily: 'var(--font-mono)' }}>{finances.receivedCount} txns</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>First Transaction</div>
                                            <div style={{ fontSize: '0.7rem' }}>{finances.firstTx}</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Last Transaction</div>
                                            <div style={{ fontSize: '0.7rem' }}>{finances.lastTx}</div>

                                            <div style={{ color: 'var(--color-text-secondary)' }}>Active Period</div>
                                            <div style={{ fontFamily: 'var(--font-mono)' }}>{finances.activeDays} day{finances.activeDays !== 1 ? 's' : ''}</div>
                                        </div>
                                    </div>

                                    {/* Risk Explanation */}
                                    <div className="glass-card p-4" style={{
                                        borderLeft: `4px solid ${getScoreColor(detail.suspicion_score)}`,
                                        background: `${getScoreColor(detail.suspicion_score)}06`
                                    }}>
                                        <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: getScoreColor(detail.suspicion_score), marginBottom: '8px', letterSpacing: '0.04em' }}>
                                            FORENSIC RISK BRIEF
                                        </h3>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                                            {riskExplanation}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: TRANSACTIONS */}
                            {activeTab === 'transactions' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {/* Summary Bar */}
                                    <div style={{
                                        padding: '10px 14px',
                                        backgroundColor: 'rgba(0, 245, 255, 0.04)',
                                        border: '1px solid rgba(0, 245, 255, 0.1)',
                                        borderRadius: '8px',
                                        fontSize: '0.68rem',
                                        lineHeight: 1.6,
                                        color: 'var(--color-text-secondary)'
                                    }}>
                                        <div>
                                            <strong style={{ color: '#fff' }}>{detail.transactions.length}</strong> transactions total &middot; {finances.sentCount} sent, {finances.receivedCount} received
                                        </div>
                                        <div style={{ marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                                            Total sent: <span style={{ color: 'var(--color-risk-red)' }}>{formatINR(finances.sentSum)}</span> | Total received: <span style={{ color: 'var(--color-risk-green)' }}>{formatINR(finances.receivedSum)}</span>
                                        </div>
                                    </div>

                                    {/* Scrollable Table */}
                                    <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                                                <thead>
                                                    <tr style={{ background: 'rgba(0, 245, 255, 0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <th style={{ padding: '10px', textAlign: 'left', color: 'var(--color-text-secondary)' }}>TX ID</th>
                                                        <th style={{ padding: '10px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Dir</th>
                                                        <th style={{ padding: '10px', textAlign: 'left', color: 'var(--color-text-secondary)' }}>Counterparty</th>
                                                        <th 
                                                            onClick={() => handleSort('amount')}
                                                            style={{ padding: '10px', textAlign: 'right', color: 'var(--color-accent)', cursor: 'pointer', userSelect: 'none' }}
                                                        >
                                                            Amount {txSort.column === 'amount' ? (txSort.direction === 'desc' ? '▼' : '▲') : ''}
                                                        </th>
                                                        <th 
                                                            onClick={() => handleSort('timestamp')}
                                                            style={{ padding: '10px', textAlign: 'left', color: 'var(--color-accent)', cursor: 'pointer', userSelect: 'none' }}
                                                        >
                                                            Timestamp {txSort.column === 'timestamp' ? (txSort.direction === 'desc' ? '▼' : '▲') : ''}
                                                        </th>
                                                        <th style={{ padding: '10px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Fraud?</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedTransactions.map((tx) => (
                                                        <tr 
                                                            key={tx.transaction_id}
                                                            style={{
                                                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                                background: tx.is_ring_transaction ? 'rgba(255,59,59,0.02)' : 'transparent',
                                                                transition: 'background 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 245, 255, 0.02)'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = tx.is_ring_transaction ? 'rgba(255,59,59,0.02)' : 'transparent'}
                                                        >
                                                            <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>
                                                                {tx.transaction_id.slice(-6)}
                                                            </td>
                                                            <td style={{ padding: '10px', textAlign: 'center', fontSize: '0.85rem' }}>
                                                                {tx.direction === 'sent' ? (
                                                                    <span style={{ color: 'var(--color-risk-red)', fontWeight: 'bold' }}>→</span>
                                                                ) : (
                                                                    <span style={{ color: 'var(--color-risk-green)', fontWeight: 'bold' }}>←</span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '10px', fontFamily: 'var(--font-mono)' }}>
                                                                <span
                                                                    style={{ color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer' }}
                                                                    onClick={() => onSelectAccount(tx.counterparty)}
                                                                >
                                                                    {tx.counterparty}
                                                                </span>
                                                            </td>
                                                            <td style={{
                                                                padding: '10px',
                                                                textAlign: 'right',
                                                                fontFamily: 'var(--font-mono)',
                                                                fontWeight: 600,
                                                                color: tx.is_ring_transaction ? 'var(--color-risk-red)' : 'var(--color-text-primary)'
                                                            }}>
                                                                {formatINR(tx.amount)}
                                                            </td>
                                                            <td style={{ padding: '10px', color: 'var(--color-text-secondary)', fontSize: '0.65rem' }}>
                                                                {tx.timestamp.split(' ')[1] || tx.timestamp}
                                                            </td>
                                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                                {tx.is_ring_transaction ? (
                                                                    <span style={{
                                                                        padding: '2px 4px',
                                                                        borderRadius: '3px',
                                                                        fontSize: '0.55rem',
                                                                        fontWeight: 'bold',
                                                                        background: 'rgba(255,59,59,0.15)',
                                                                        color: 'var(--color-risk-red)',
                                                                        border: '1px solid rgba(255,59,59,0.3)'
                                                                    }}>FRAUD</span>
                                                                ) : (
                                                                    <span style={{
                                                                        padding: '2px 4px',
                                                                        borderRadius: '3px',
                                                                        fontSize: '0.55rem',
                                                                        background: 'rgba(255,255,255,0.05)',
                                                                        color: 'var(--color-text-dim)'
                                                                    }}>NORMAL</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: RING */}
                            {activeTab === 'ring' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {!detail.ring_details ? (
                                        <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                            Not part of any fraud ring.
                                        </div>
                                    ) : (
                                        <>
                                            {/* Ring Metadata Card */}
                                            <div className="glass-card p-4">
                                                <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '12px', letterSpacing: '0.04em' }}>
                                                    FRAUD RING DETECTED
                                                </h3>
                                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '8px', fontSize: '0.75rem' }}>
                                                    <div style={{ color: 'var(--color-text-secondary)' }}>Ring ID</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent)' }}>
                                                        {detail.ring_details.ring_id}
                                                    </div>

                                                    <div style={{ color: 'var(--color-text-secondary)' }}>Pattern Type</div>
                                                    <div style={{ textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span>📁</span> {detail.ring_details.pattern_type}
                                                    </div>

                                                    <div style={{ color: 'var(--color-text-secondary)' }}>Risk Score</div>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-risk-red)' }}>
                                                                {detail.ring_details.risk_score}%
                                                            </span>
                                                            <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${detail.ring_details.risk_score}%`, background: 'var(--color-risk-red)' }} />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div style={{ color: 'var(--color-text-secondary)' }}>Recommendation</div>
                                                    <div>{renderDecisionBadge(detail.ring_details.recommendation)}</div>

                                                    <div style={{ color: 'var(--color-text-secondary)' }}>Total Loop Vol</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                                        {formatINR(detail.ring_details.total_amount)}
                                                    </div>

                                                    <div style={{ color: 'var(--color-text-secondary)' }}>Ring Txns</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)' }}>{detail.ring_details.tx_count} txns</div>

                                                    <div style={{ color: 'var(--color-text-secondary)' }}>Members</div>
                                                    <div>{detail.ring_details.members.length} accounts</div>
                                                </div>
                                            </div>

                                            {/* Ring Flow Diagram */}
                                            <div className="glass-card p-4">
                                                <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '16px', letterSpacing: '0.04em' }}>
                                                    STRUCTURAL FLOW DIAGRAM
                                                </h3>

                                                {/* Text based visualization based on pattern type */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.18)', padding: '16px', borderRadius: '8px' }}>
                                                    {detail.ring_details.pattern_type === 'smurfing' && (
                                                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                                            {detail.ring_details.members.slice(0, 3).map((m, idx) => (
                                                                m.account_id !== detail.account_id && (
                                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
                                                                        <span style={{ color: 'var(--color-text-secondary)' }}>[{m.account_id}]</span>
                                                                        <span style={{ color: 'var(--color-accent)' }}>──→</span>
                                                                    </div>
                                                                )
                                                            ))}
                                                            <div style={{
                                                                padding: '6px 12px',
                                                                border: '1px solid var(--color-accent)',
                                                                borderRadius: '4px',
                                                                color: 'var(--color-accent)',
                                                                fontWeight: 'bold',
                                                                fontFamily: 'var(--font-mono)',
                                                                fontSize: '0.72rem',
                                                                background: 'rgba(0, 245, 255, 0.08)'
                                                            }}>
                                                                [{detail.account_id} (HUB)]
                                                            </div>
                                                            {detail.ring_details.members.length > 4 && (
                                                                <div style={{ fontSize: '0.62rem', color: 'var(--color-text-dim)', fontStyle: 'italic', marginTop: '4px' }}>
                                                                    + {detail.ring_details.members.length - 4} other mule accounts
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {detail.ring_details.pattern_type === 'cycle' && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
                                                            {detail.ring_details.members.slice(0, 4).map((m, idx) => (
                                                                <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{
                                                                        padding: '4px 8px',
                                                                        border: m.account_id === detail.account_id ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                                                                        background: m.account_id === detail.account_id ? 'rgba(0,245,255,0.05)' : 'transparent',
                                                                        borderRadius: '4px',
                                                                        color: m.account_id === detail.account_id ? 'var(--color-accent)' : '#fff'
                                                                    }}>
                                                                        {m.account_id}
                                                                    </span>
                                                                    <span style={{ color: 'var(--color-text-dim)' }}>──→</span>
                                                                </span>
                                                            ))}
                                                            <span style={{ color: 'var(--color-accent)', fontWeight: 'bold' }}>LOOP</span>
                                                        </div>
                                                    )}

                                                    {detail.ring_details.pattern_type !== 'smurfing' && detail.ring_details.pattern_type !== 'cycle' && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                                                            {detail.ring_details.members.slice(0, 4).map((m, idx) => (
                                                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                    <span style={{
                                                                        padding: '4px 8px',
                                                                        border: m.account_id === detail.account_id ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                                                                        borderRadius: '4px',
                                                                        color: m.account_id === detail.account_id ? 'var(--color-accent)' : '#fff'
                                                                    }}>
                                                                        {m.account_id} ({m.role})
                                                                    </span>
                                                                    {idx < Math.min(3, detail.ring_details.members.length - 1) && (
                                                                        <span style={{ color: 'var(--color-text-dim)' }}>↓</span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {detail.ring_details.members.length > 4 && (
                                                                <span style={{ fontSize: '0.62rem', color: 'var(--color-text-dim)' }}>
                                                                    + {detail.ring_details.members.length - 4} more nodes
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Ring Members List */}
                                            <div className="glass-card overflow-hidden">
                                                <h3 style={{ padding: '12px 16px', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', borderBottom: '1px solid rgba(255,255,255,0.05)', letterSpacing: '0.04em' }}>
                                                    RING MEMBERS
                                                </h3>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                                                    <thead>
                                                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--color-text-secondary)' }}>Account ID</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--color-text-secondary)' }}>Role</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>Score</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Verdict</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detail.ring_details.members.map((m) => {
                                                            const isSelf = m.account_id === detail.account_id;
                                                            return (
                                                                <tr
                                                                    key={m.account_id}
                                                                    onClick={() => onSelectAccount(m.account_id)}
                                                                    style={{
                                                                        borderBottom: '1px solid rgba(255,255,255,0.02)',
                                                                        background: isSelf ? 'rgba(0, 245, 255, 0.06)' : 'transparent',
                                                                        cursor: 'pointer',
                                                                        fontWeight: isSelf ? 700 : 'normal',
                                                                        transition: 'background 0.2s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isSelf ? 'rgba(0, 245, 255, 0.08)' : 'rgba(255,255,255,0.02)'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isSelf ? 'rgba(0, 245, 255, 0.06)' : 'transparent'}
                                                                >
                                                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: isSelf ? 'var(--color-accent)' : '#fff' }}>
                                                                        {m.account_id}
                                                                    </td>
                                                                    <td style={{ padding: '8px 12px' }}>{m.role}</td>
                                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{m.score.toFixed(1)}</td>
                                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                        <span style={{
                                                                            fontSize: '0.55rem',
                                                                            fontWeight: 'bold',
                                                                            color: m.decision === 'BLOCK' ? 'var(--color-risk-red)' : m.decision === 'REVIEW' ? 'var(--color-risk-orange)' : 'var(--color-risk-green)'
                                                                        }}>{m.decision}</span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* TAB 4: CONNECTED ACCOUNTS */}
                            {activeTab === 'connected' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Stats Brief */}
                                    <div style={{
                                        padding: '10px 12px',
                                        backgroundColor: 'rgba(0, 245, 255, 0.03)',
                                        border: '1px solid rgba(0, 245, 255, 0.08)',
                                        borderRadius: '8px',
                                        fontSize: '0.68rem',
                                        color: 'var(--color-text-secondary)',
                                        lineHeight: 1.5
                                    }}>
                                        <div>
                                            Sent money to <strong style={{ color: '#fff' }}>{detail.connections.sent_to.length}</strong> accounts &middot; Received from <strong style={{ color: '#fff' }}>{detail.connections.received_from.length}</strong> accounts
                                        </div>
                                        {/* Highlight Most Suspicious */}
                                        {(() => {
                                            const allConns = [...detail.connections.sent_to, ...detail.connections.received_from];
                                            if (allConns.length === 0) return null;
                                            const maxSusp = allConns.reduce((a, b) => a.score > b.score ? a : b);
                                            const totalExposure = allConns
                                                .filter((c) => c.decision === 'BLOCK' || c.decision === 'REVIEW')
                                                .reduce((sum, c) => sum + c.total_amount, 0);

                                            return (
                                                <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                                                    <div>Most suspicious connection: <span style={{ color: getScoreColor(maxSusp.score) }}>{maxSusp.account_id} ({maxSusp.score.toFixed(0)})</span></div>
                                                    <div>Total exposure to flagged nodes: <span style={{ color: 'var(--color-risk-red)' }}>{formatINR(totalExposure)}</span></div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Helper function to render neighbor tables */}
                                    {(() => {
                                        const renderConnectionTable = (title, items) => {
                                            return (
                                                <div className="glass-card overflow-hidden">
                                                    <h3 style={{
                                                        padding: '12px 16px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        fontFamily: 'var(--font-mono)',
                                                        color: 'var(--color-accent)',
                                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                        letterSpacing: '0.04em'
                                                    }}>{title}</h3>
                                                    {items.length === 0 ? (
                                                        <div style={{ padding: '16px', fontSize: '0.7rem', color: 'var(--color-text-dim)', fontStyle: 'italic', fontFamily: 'var(--font-mono)' }}>No accounts found.</div>
                                                    ) : (
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                                                            <thead>
                                                                <tr style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--color-text-secondary)' }}>Account ID</th>
                                                                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>Total Amt</th>
                                                                    <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Txns</th>
                                                                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>Score</th>
                                                                    <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Verdict</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {items.map((conn) => {
                                                                    const isBlock = conn.decision === 'BLOCK';
                                                                    const inSameRing = detail.ring_details?.members.some((m) => m.account_id === conn.account_id);
                                                                    
                                                                    let borderStyle = {};
                                                                    let bgStyle = 'transparent';
                                                                    if (isBlock) {
                                                                        borderStyle = { borderLeft: '3px solid var(--color-risk-red)' };
                                                                        bgStyle = 'rgba(255,59,59,0.02)';
                                                                    } else if (inSameRing) {
                                                                        borderStyle = { borderLeft: '3px solid var(--color-accent)' };
                                                                        bgStyle = 'rgba(0,245,255,0.01)';
                                                                    }

                                                                    return (
                                                                        <tr
                                                                            key={conn.account_id}
                                                                            onClick={() => onSelectAccount(conn.account_id)}
                                                                            style={{
                                                                                borderBottom: '1px solid rgba(255,255,255,0.02)',
                                                                                background: bgStyle,
                                                                                cursor: 'pointer',
                                                                                transition: 'background 0.2s',
                                                                                ...borderStyle
                                                                            }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = bgStyle}
                                                                        >
                                                                            <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                                                                                {conn.account_id}
                                                                            </td>
                                                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                                                                                {formatINR(conn.total_amount)}
                                                                            </td>
                                                                            <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{conn.tx_count}</td>
                                                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{conn.score.toFixed(0)}</td>
                                                                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                                <span style={{
                                                                                    fontSize: '0.55rem',
                                                                                    fontWeight: 'bold',
                                                                                    color: conn.decision === 'BLOCK' ? 'var(--color-risk-red)' : conn.decision === 'REVIEW' ? 'var(--color-risk-orange)' : 'var(--color-risk-green)'
                                                                                }}>{conn.decision}</span>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            );
                                        };

                                        return (
                                            <>
                                                {renderConnectionTable(`SENT MONEY TO (${detail.connections.sent_to.length} accounts)`, detail.connections.sent_to)}
                                                {renderConnectionTable(`RECEIVED MONEY FROM (${detail.connections.received_from.length} accounts)`, detail.connections.received_from)}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* TAB 5: ML SCORES */}
                            {activeTab === 'ml scores' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Formula Equation Display */}
                                    <div className="glass-card p-4 text-center">
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--color-text-dim)', letterSpacing: '0.08em', marginBottom: '8px' }}>
                                            WEIGHTED SCORING EQUATION
                                        </p>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                                            GAT×25% + LSTM×20% + EIF×30% + Rules×25%
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#fff', marginTop: '6px' }}>
                                            {detail.ml_scores.GAT}×0.25 + {detail.ml_scores.LSTM}×0.20 + {detail.ml_scores.EIF}×0.30 + {detail.ml_scores.Rules}×0.25 = <span style={{ color: getScoreColor(detail.suspicion_score) }}>{detail.suspicion_score.toFixed(1)}</span>
                                        </div>
                                    </div>

                                    {/* 4 Pillar Breakdown */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {[
                                            {
                                                name: 'GAT Score (Graph Attention)',
                                                score: detail.ml_scores.GAT,
                                                desc: 'Measures centrality in the transaction network. High score = key node in a fraud ring.'
                                            },
                                            {
                                                name: 'LSTM Score (Temporal Patterns)',
                                                score: detail.ml_scores.LSTM,
                                                desc: 'Measures transaction timing anomalies. High score = burst activity or irregular timing.'
                                            },
                                            {
                                                name: 'EIF Score (Isolation Forest)',
                                                score: detail.ml_scores.EIF,
                                                desc: 'Statistical outlier detection across 20 behavioral features. High score = unusual compared to peers.'
                                            },
                                            {
                                                name: 'Rules Score (RBI/NPCI Flags)',
                                                score: detail.ml_scores.Rules,
                                                desc: 'Regulatory rule violations. Each triggered rule adds to this score.'
                                            }
                                        ].map((p, idx) => (
                                            <div key={idx} className="glass-card p-3">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#fff' }}>{p.name}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: getScoreColor(p.score) }}>{p.score}/100</span>
                                                </div>
                                                <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                                                    <div style={{ height: '100%', width: `${p.score}%`, background: getScoreColor(p.score) }} />
                                                </div>
                                                <p style={{ fontSize: '0.66rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                                                    {p.desc}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Flag details list */}
                                    <div className="glass-card p-4">
                                        <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '10px', letterSpacing: '0.04em' }}>
                                            COMPLIANCE VIOLATION RECORDS
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {detail.flag_hits?.length > 0 ? (
                                                detail.flag_hits.map((flag) => (
                                                    <div key={flag} style={{
                                                        padding: '8px 10px',
                                                        borderRadius: '6px',
                                                        background: 'rgba(255, 59, 59, 0.05)',
                                                        border: '1px solid rgba(255, 59, 59, 0.15)',
                                                        fontFamily: 'var(--font-mono)',
                                                        fontSize: '0.68rem',
                                                        color: '#fff',
                                                        lineHeight: 1.4
                                                    }}>
                                                        {FLAG_DESCRIPTIONS[flag] || flag}
                                                    </div>
                                                ))
                                            ) : (
                                                <div style={{ color: 'var(--color-text-dim)', fontSize: '0.7rem', fontStyle: 'italic', fontFamily: 'var(--font-mono)' }}>
                                                    No regulatory rule violations found.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}
