import { useState, useMemo, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppContext } from '../App';
import NodeInspector, { DrawerShell } from '../components/NodeInspector';
import { getTransactions } from '../services/api';
import { Icon, PageHead, Score, Verdict, SortHead, SkeletonRows, EmptyState, tierOf } from '../components/ui';
import { formatINR, formatNum, patternLabel } from '../lib/format';

const PAGE_SIZE = 50;

/* Same three-way classification the ledger always used. */
function txStatus(tx) {
    if (tx.is_ring_transaction) return { cls: 'crit', label: 'Ring fraud', long: 'Fraudulent ring transaction' };
    if (tx.sender_score > 30 || tx.receiver_score > 30) return { cls: 'warn', label: 'Suspicious', long: 'Suspicious counterparties' };
    return { cls: 'pos', label: 'Normal', long: 'Normal transaction' };
}

function PartyBlock({ title, id, score, role, ring, patterns, onInspect }) {
    const t = score >= 75 ? 'crit' : score >= 40 ? 'warn' : 'low';
    return (
        <section className="panel" style={{ overflow: 'hidden' }}>
            <div className="panel-head" style={{ minHeight: 42, padding: '10px 14px' }}>
                <span className="label" style={{ color: 'var(--ink-2)' }}>{title}</span>
                <button className="btn btn-sm" onClick={() => onInspect(id)}>Open account file <Icon name="arrowRight" size={12} /></button>
            </div>
            <dl className="kv" style={{ padding: '4px 14px 6px' }}>
                <dt>Account</dt><dd className="mono">{id}</dd>
                <dt>Fraud score</dt><dd><Score value={score} tier={t} width={80} /></dd>
                <dt>Role</dt><dd className="mono">{role}</dd>
                <dt>Ring</dt><dd className="mono">{ring || 'None'}</dd>
                <dt>Flags</dt>
                <dd>
                    <div className="flex flex-wrap gap-1">
                        {patterns?.length > 0 ? patterns.map((p) => <span key={p} className="pattern-chip">{patternLabel(p)}</span>) : <span style={{ color: 'var(--ink-3)' }}>None</span>}
                    </div>
                </dd>
            </dl>
        </section>
    );
}

function TransactionInspector({ tx, onClose, onInspectAccount }) {
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    if (!tx) return null;
    const st = txStatus(tx);
    const sTone = (s) => (s >= 75 ? 'var(--crit)' : s >= 40 ? 'var(--warn)' : 'var(--ink-2)');

    return (
        <DrawerShell onClose={onClose} label={`Transaction ${tx.transaction_id}`}>
            <div className="drawer-head">
                <button className="btn btn-ghost btn-icon drawer-close" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
                <div className="label">Transaction</div>
                <h2 className="mono" style={{ fontSize: '1.05rem', fontWeight: 500, marginTop: 6, marginRight: 32, overflowWrap: 'anywhere' }}>{tx.transaction_id}</h2>
                <div className="flex items-end justify-between gap-4 flex-wrap" style={{ marginTop: 16 }}>
                    <div>
                        <div className="num" style={{ fontSize: '1.9rem', letterSpacing: '-0.03em', lineHeight: 1 }}>{formatINR(tx.amount)}</div>
                        <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--ink-3)', marginTop: 8 }}>{tx.timestamp}</div>
                    </div>
                    <span className={`tag tag-dot ${st.cls}`}>{st.long}</span>
                </div>
            </div>

            <div className="drawer-body">
                {/* Pathway */}
                <section className="panel" style={{ padding: '16px 14px' }}>
                    <div className="label" style={{ marginBottom: 14 }}>Pathway</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 10 }}>
                        {[['Sender', tx.sender_id, tx.sender_role, tx.sender_score], null, ['Receiver', tx.receiver_id, tx.receiver_role, tx.receiver_score]].map((p, i) =>
                            p === null ? (
                                <div key="arrow" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: tx.is_ring_transaction ? 'var(--crit)' : 'var(--ink-3)' }}>
                                    <Icon name="arrowRight" size={18} />
                                </div>
                            ) : (
                                <div key={i} style={{ minWidth: 0, textAlign: i === 0 ? 'left' : 'right' }}>
                                    <div className="label" style={{ fontSize: '0.6rem' }}>{p[0]}</div>
                                    <button className="link-id" style={{ marginTop: 6, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => onInspectAccount(p[1])} title={p[1]}>{p[1]}</button>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--ink-3)', marginTop: 4 }}>
                                        {p[2]} · <span className="num" style={{ color: sTone(p[3]) }}>{Math.round(p[3])}</span>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                </section>

                <PartyBlock title="Sender" id={tx.sender_id} score={tx.sender_score} role={tx.sender_role} ring={tx.sender_ring} patterns={tx.sender_patterns} onInspect={onInspectAccount} />
                <PartyBlock title="Receiver" id={tx.receiver_id} score={tx.receiver_score} role={tx.receiver_role} ring={tx.receiver_ring} patterns={tx.receiver_patterns} onInspect={onInspectAccount} />
            </div>
        </DrawerShell>
    );
}

const RISK_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
];

export default function TransactionsPage() {
    const { result } = useAppContext();
    const [activeView, setActiveView] = useState('accounts'); // 'accounts' | 'transactions'
    const [search, setSearch] = useState('');
    const [filterRisk, setFilterRisk] = useState('all');
    const [sortBy, setSortBy] = useState('score');
    const [sortDir, setSortDir] = useState('desc');

    // Transactions tab states
    const [txs, setTxs] = useState([]);
    const [totalTxs, setTotalTxs] = useState(0);
    const [txPage, setTxPage] = useState(1);
    const [txSearch, setTxSearch] = useState('');
    const [txSortBy, setTxSortBy] = useState('timestamp');
    const [txSortDir, setTxSortDir] = useState('desc');
    const [txLoading, setTxLoading] = useState(false);
    const [txError, setTxError] = useState(null);
    const [txReload, setTxReload] = useState(0);
    const [selectedTx, setSelectedTx] = useState(null);
    const [selectedAccount, setSelectedAccount] = useState(null);

    // Fetch transactions when query parameters change
    useEffect(() => {
        if (activeView !== 'transactions') return;

        let active = true;
        const fetchTxs = async () => {
            setTxLoading(true);
            setTxError(null);
            try {
                const data = await getTransactions({
                    page: txPage,
                    limit: PAGE_SIZE,
                    search: txSearch,
                    sort_by: txSortBy,
                    sort_dir: txSortDir
                });
                if (active) {
                    setTxs(data.transactions || []);
                    setTotalTxs(data.total || 0);
                }
            } catch (err) {
                console.error(err);
                if (active) setTxError(err?.response?.data?.detail || err.message || 'Failed to load transactions');
            } finally {
                if (active) setTxLoading(false);
            }
        };

        const delayDebounce = setTimeout(() => {
            fetchTxs();
        }, txSearch ? 300 : 0);

        return () => {
            active = false;
            clearTimeout(delayDebounce);
        };
    }, [activeView, txPage, txSearch, txSortBy, txSortDir, txReload]);

    const handleTxSearchChange = (val) => {
        setTxSearch(val);
        setTxPage(1);
    };

    const toggleTxSort = (col) => {
        if (txSortBy === col) setTxSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else { setTxSortBy(col); setTxSortDir('desc'); }
        setTxPage(1);
    };

    const totalPages = Math.ceil(totalTxs / PAGE_SIZE);

    const accounts = useMemo(() => {
        let list = [...(result.suspicious_accounts || [])];

        if (search) {
            const q = search.toLowerCase();
            list = list.filter((a) =>
                a.account_id.toLowerCase().includes(q) ||
                a.detected_patterns.some((p) => p.toLowerCase().includes(q)) ||
                (a.ring_id && a.ring_id.toLowerCase().includes(q))
            );
        }

        if (filterRisk !== 'all') {
            list = list.filter((a) => {
                if (filterRisk === 'high') return a.suspicion_score > 70;
                if (filterRisk === 'medium') return a.suspicion_score > 30 && a.suspicion_score <= 70;
                if (filterRisk === 'low') return a.suspicion_score <= 30;
                return true;
            });
        }

        list.sort((a, b) => {
            let va, vb;
            if (sortBy === 'score') { va = a.suspicion_score; vb = b.suspicion_score; }
            else if (sortBy === 'id') { va = a.account_id; vb = b.account_id; }
            else if (sortBy === 'ring') { va = a.ring_id || ''; vb = b.ring_id || ''; }
            else { va = a.detected_patterns.length; vb = b.detected_patterns.length; }
            if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return sortDir === 'asc' ? va - vb : vb - va;
        });

        return list;
    }, [result, search, filterRisk, sortBy, sortDir]);

    const riskCounts = useMemo(() => {
        const all = result.suspicious_accounts || [];
        return {
            all: all.length,
            high: all.filter((a) => a.suspicion_score > 70).length,
            medium: all.filter((a) => a.suspicion_score > 30 && a.suspicion_score <= 70).length,
            low: all.filter((a) => a.suspicion_score <= 30).length,
        };
    }, [result]);

    const toggleSort = (col) => {
        if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortBy(col); setSortDir('desc'); }
    };

    const tableHeight = 'calc(100vh - 330px)';

    return (
        <div className="page">
            <PageHead
                eyebrow="Data explorer"
                title="Ledger"
                sub="Audit flagged account profiles and the full transaction history behind them."
            />

            <div className="tabs" style={{ marginBottom: 16 }}>
                <button className={`tab ${activeView === 'accounts' ? 'on' : ''}`} onClick={() => setActiveView('accounts')}>
                    Flagged accounts <span className="cnt">{formatNum(result.suspicious_accounts?.length || 0)}</span>
                </button>
                <button className={`tab ${activeView === 'transactions' ? 'on' : ''}`} onClick={() => setActiveView('transactions')}>
                    All transactions {totalTxs > 0 && <span className="cnt">{formatNum(totalTxs)}</span>}
                </button>
            </div>

            {/* VIEW 1: FLAGGED ACCOUNTS */}
            {activeView === 'accounts' && (
                <section className="panel" style={{ overflow: 'hidden' }}>
                    <div className="panel-head" style={{ flexWrap: 'wrap' }}>
                        <div className="field" style={{ flex: '1 1 260px', maxWidth: 380 }}>
                            <Icon name="search" size={14} />
                            <input className="input" type="text" placeholder="Search accounts, patterns, rings" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search accounts" />
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="panel-meta">Risk</span>
                            <div className="seg" role="group" aria-label="Risk filter">
                                {RISK_FILTERS.map((r) => (
                                    <button key={r.key} className={filterRisk === r.key ? 'on' : ''} onClick={() => setFilterRisk(r.key)}>
                                        {r.label} <span className="cnt">{formatNum(riskCounts[r.key])}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="table-wrap" style={{ maxHeight: tableHeight }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <SortHead col="id" label="Account" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                                    <SortHead col="score" label="Fraud score" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                                    <th>Verdict</th>
                                    <SortHead col="patterns" label="Patterns" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                                    <SortHead col="ring" label="Ring" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                                    <th>Risk level</th>
                                    <th>Score breakdown</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((a) => {
                                    const t = tierOf(a.suspicion_score);
                                    return (
                                        <tr key={a.account_id} className="clickable" onClick={() => setSelectedAccount(a.account_id)}>
                                            <td><button className="link-id" onClick={(e) => { e.stopPropagation(); setSelectedAccount(a.account_id); }}>{a.account_id}</button></td>
                                            <td><Score value={a.suspicion_score} tier={t} /></td>
                                            <td><Verdict value={a.verdict} /></td>
                                            <td>
                                                <div className="flex gap-1" style={{ flexWrap: 'nowrap' }}>
                                                    {a.detected_patterns.slice(0, 2).map((p) => <span key={p} className="pattern-chip" title={patternLabel(p)}>{p}</span>)}
                                                    {a.detected_patterns.length > 2 && <span className="pattern-chip" title={a.detected_patterns.slice(2).join(', ')}>+{a.detected_patterns.length - 2}</span>}
                                                </div>
                                            </td>
                                            <td className="mono dim" style={{ fontSize: '0.76rem' }}>{a.ring_id && a.ring_id !== 'NONE' ? a.ring_id : '—'}</td>
                                            <td>
                                                <span className={`tag tag-dot ${t === 'crit' ? 'crit' : t === 'warn' ? 'warn' : 'pos'}`}>
                                                    {t === 'crit' ? 'High risk' : t === 'warn' ? 'Suspicious' : 'Low'}
                                                </span>
                                            </td>
                                            <td className="mono dim" style={{ fontSize: '0.7rem', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={a.explanation}>
                                                {a.explanation || '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {accounts.length === 0 && (
                            <EmptyState icon="search" title="No accounts match" action={(search || filterRisk !== 'all') && <button className="btn btn-sm" onClick={() => { setSearch(''); setFilterRisk('all'); }}>Clear filters</button>}>
                                Adjust the search or risk filter.
                            </EmptyState>
                        )}
                    </div>
                    <div className="flex items-center justify-between" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: '0.74rem', color: 'var(--ink-3)' }}>
                        <span>Showing <span className="mono">{formatNum(accounts.length)}</span> of <span className="mono">{formatNum(riskCounts.all)}</span> flagged accounts</span>
                        <span className="hide-sm">Select a row to open the account file</span>
                    </div>
                </section>
            )}

            {/* VIEW 2: ALL TRANSACTIONS */}
            {activeView === 'transactions' && (
                <section className="panel" style={{ overflow: 'hidden' }}>
                    <div className="panel-head" style={{ flexWrap: 'wrap' }}>
                        <div className="field" style={{ flex: '1 1 260px', maxWidth: 380 }}>
                            <Icon name="search" size={14} />
                            <input className="input" type="text" placeholder="Search by transaction, sender or receiver ID" value={txSearch} onChange={(e) => handleTxSearchChange(e.target.value)} aria-label="Search transactions" />
                        </div>
                        <span className="panel-meta">
                            {txLoading ? 'Loading…' : <><span className="mono" style={{ color: 'var(--ink)' }}>{formatNum(totalTxs)}</span> transactions{txSearch && ' matching'}</>}
                        </span>
                    </div>

                    <div className="table-wrap" style={{ maxHeight: tableHeight }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <SortHead col="transaction_id" label="Transaction" sortBy={txSortBy} sortDir={txSortDir} onSort={toggleTxSort} />
                                    <SortHead col="sender_id" label="Sender" sortBy={txSortBy} sortDir={txSortDir} onSort={toggleTxSort} />
                                    <SortHead col="receiver_id" label="Receiver" sortBy={txSortBy} sortDir={txSortDir} onSort={toggleTxSort} />
                                    <SortHead col="amount" label="Amount" sortBy={txSortBy} sortDir={txSortDir} onSort={toggleTxSort} align="right" />
                                    <SortHead col="timestamp" label="Timestamp" sortBy={txSortBy} sortDir={txSortDir} onSort={toggleTxSort} />
                                    <th>Compliance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {txLoading ? <SkeletonRows rows={10} cols={6} /> : !txError && txs.map((tx) => {
                                    const st = txStatus(tx);
                                    return (
                                        <tr key={tx.transaction_id} className="clickable" onClick={() => setSelectedTx(tx)}>
                                            <td className="mono dim" style={{ fontSize: '0.76rem' }}>{tx.transaction_id}</td>
                                            <td>
                                                <span className="flex items-center gap-2">
                                                    <button className="link-id" onClick={(e) => { e.stopPropagation(); setSelectedAccount(tx.sender_id); }}>{tx.sender_id}</button>
                                                    <span className="mono" style={{ fontSize: '0.62rem', color: 'var(--ink-4)' }}>{tx.sender_role}</span>
                                                </span>
                                            </td>
                                            <td>
                                                <span className="flex items-center gap-2">
                                                    <button className="link-id" onClick={(e) => { e.stopPropagation(); setSelectedAccount(tx.receiver_id); }}>{tx.receiver_id}</button>
                                                    <span className="mono" style={{ fontSize: '0.62rem', color: 'var(--ink-4)' }}>{tx.receiver_role}</span>
                                                </span>
                                            </td>
                                            <td className="r num">{formatINR(tx.amount)}</td>
                                            <td className="mono dim" style={{ fontSize: '0.74rem', whiteSpace: 'nowrap' }}>{tx.timestamp}</td>
                                            <td><span className={`tag tag-dot ${st.cls}`}>{st.label}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {!txLoading && txError && (
                            <EmptyState icon="alert" title="Could not load transactions" action={<button className="btn btn-sm" onClick={() => setTxReload((n) => n + 1)}><Icon name="refresh" size={13} /> Retry</button>}>
                                {txError}
                            </EmptyState>
                        )}
                        {!txLoading && !txError && txs.length === 0 && (
                            <EmptyState icon="search" title="No transactions found">No records match the current query.</EmptyState>
                        )}
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: '0.74rem', color: 'var(--ink-3)' }}>
                        <span>
                            {totalTxs > 0
                                ? <>Rows <span className="mono">{formatNum((txPage - 1) * PAGE_SIZE + 1)}–{formatNum(Math.min(totalTxs, txPage * PAGE_SIZE))}</span> of <span className="mono">{formatNum(totalTxs)}</span></>
                                : '—'}
                        </span>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button className="btn btn-sm" onClick={() => setTxPage((p) => Math.max(1, p - 1))} disabled={txPage === 1 || txLoading}>
                                    <Icon name="chevronLeft" size={13} /> Prev
                                </button>
                                <span className="mono" style={{ padding: '0 6px' }}>{txPage} / {totalPages}</span>
                                <button className="btn btn-sm" onClick={() => setTxPage((p) => Math.min(totalPages, p + 1))} disabled={txPage === totalPages || txLoading}>
                                    Next <Icon name="chevronRight" size={13} />
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            )}

            <AnimatePresence>
                {selectedAccount && (
                    <NodeInspector
                        key="acc"
                        accountId={selectedAccount}
                        onClose={() => setSelectedAccount(null)}
                        onSelectAccount={(id) => setSelectedAccount(id)}
                        result={result}
                    />
                )}
                {selectedTx && (
                    <TransactionInspector
                        key="tx"
                        tx={selectedTx}
                        onClose={() => setSelectedTx(null)}
                        onInspectAccount={(id) => {
                            setSelectedTx(null);
                            setSelectedAccount(id);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
