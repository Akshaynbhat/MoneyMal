import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../App';
import NodeInspector from '../components/NodeInspector';
import { getTransactions } from '../services/api';

function TransactionInspector({ tx, onClose, onInspectAccount }) {
    if (!tx) return null;

    const formatINR = (val) => {
        return Number(val || 0).toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
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
        'threshold_breach': 'Limit Threshold Breach',
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
                {/* Header */}
                <div style={{ padding: '24px', borderBottom: '1px solid rgba(0, 245, 255, 0.08)', position: 'relative' }}>
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
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-dim)', letterSpacing: '0.08em' }}>
                        TRANSACTION INSPECTION
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-accent)', marginTop: '4px' }}>
                        TX: {tx.transaction_id}
                    </h2>
                </div>

                {/* Details Container */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Amount card */}
                    <div className="glass-card p-4 text-center">
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Transfer Amount
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 800, color: '#fff', margin: '8px 0' }}>
                            {formatINR(tx.amount)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                            Timestamp: {tx.timestamp}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                            {tx.is_ring_transaction ? (
                                <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    backgroundColor: 'rgba(255, 59, 59, 0.15)',
                                    border: '1px solid var(--color-risk-red)',
                                    color: 'var(--color-risk-red)',
                                    fontFamily: 'var(--font-mono)'
                                }}>
                                    FRAUDULENT RING TRANSACTION
                                </span>
                            ) : (tx.sender_score > 30 || tx.receiver_score > 30) ? (
                                <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    backgroundColor: 'rgba(255, 159, 28, 0.15)',
                                    border: '1px solid var(--color-risk-orange)',
                                    color: 'var(--color-risk-orange)',
                                    fontFamily: 'var(--font-mono)'
                                }}>
                                    SUSPICIOUS COUNTERPARTIES
                                </span>
                            ) : (
                                <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    backgroundColor: 'rgba(0, 255, 148, 0.1)',
                                    border: '1px solid var(--color-risk-green)',
                                    color: 'var(--color-risk-green)',
                                    fontFamily: 'var(--font-mono)'
                                }}>
                                    NORMAL TRANSACTION
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Pathway Flow component */}
                    <div className="glass-card p-4">
                        <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '14px', letterSpacing: '0.04em' }}>
                            TRANSACTION PATHWAY
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                            {/* Sender */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '42%' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', marginBottom: 4 }}>SENDER</span>
                                <div 
                                    style={{
                                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer', textAlign: 'center',
                                        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}
                                    onClick={() => onInspectAccount(tx.sender_id)}
                                >
                                    {tx.sender_id}
                                </div>
                                <span style={{ fontSize: '0.6rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                    Role: {tx.sender_role}
                                </span>
                                <div style={{
                                    marginTop: 6, width: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${getScoreColor(tx.sender_score)}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', background: getScoreBg(tx.sender_score), fontSize: '0.65rem', fontWeight: 'bold'
                                }}>
                                    {Math.round(tx.sender_score)}
                                </div>
                            </div>

                            {/* Arrow */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '16%' }}>
                                <span style={{ color: tx.is_ring_transaction ? 'var(--color-risk-red)' : 'var(--color-text-dim)', fontSize: '1.2rem', fontWeight: 'bold' }}>
                                    ➔
                                </span>
                                <span style={{ fontSize: '0.52rem', color: 'var(--color-text-dim)', marginTop: 2 }}>
                                    FLOW
                                </span>
                            </div>

                            {/* Receiver */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '42%' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', marginBottom: 4 }}>RECEIVER</span>
                                <div 
                                    style={{
                                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer', textAlign: 'center',
                                        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}
                                    onClick={() => onInspectAccount(tx.receiver_id)}
                                >
                                    {tx.receiver_id}
                                </div>
                                <span style={{ fontSize: '0.6rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                    Role: {tx.receiver_role}
                                </span>
                                <div style={{
                                    marginTop: 6, width: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${getScoreColor(tx.receiver_score)}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', background: getScoreBg(tx.receiver_score), fontSize: '0.65rem', fontWeight: 'bold'
                                }}>
                                    {Math.round(tx.receiver_score)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sender Profile details */}
                    <div className="glass-card p-4">
                        <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '10px', letterSpacing: '0.04em' }}>
                            SENDER ACCOUNT PROFILE
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', rowGap: '6px', fontSize: '0.75rem', marginBottom: 12 }}>
                            <div style={{ color: 'var(--color-text-secondary)' }}>Account ID</div>
                            <div style={{ fontFamily: 'var(--font-mono)' }}>{tx.sender_id}</div>
                            
                            <div style={{ color: 'var(--color-text-secondary)' }}>Fraud Score</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: getScoreColor(tx.sender_score) }}>
                                {tx.sender_score.toFixed(1)}/100
                            </div>
                            
                            <div style={{ color: 'var(--color-text-secondary)' }}>Structural Role</div>
                            <div>{tx.sender_role}</div>
                            
                            <div style={{ color: 'var(--color-text-secondary)' }}>Ring Membership</div>
                            <div style={{ fontFamily: 'var(--font-mono)' }}>{tx.sender_ring || 'None'}</div>
                            
                            <div style={{ color: 'var(--color-text-secondary)' }}>Compliance Flags</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                {tx.sender_patterns?.length > 0 ? tx.sender_patterns.map((p) => (
                                    <span key={p} className="pattern-chip" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>
                                        {PATTERN_LABELS[p] || p}
                                    </span>
                                )) : <span style={{ color: 'var(--color-text-dim)', fontStyle: 'italic' }}>None</span>}
                            </div>
                        </div>
                        <button 
                            className="btn-primary" 
                            style={{ width: '100%', padding: '6px 0', fontSize: '0.68rem' }}
                            onClick={() => onInspectAccount(tx.sender_id)}
                        >
                            🔎 Inspect Full Sender Forensics
                        </button>
                    </div>

                    {/* Receiver Profile details */}
                    <div className="glass-card p-4">
                        <h3 style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '10px', letterSpacing: '0.04em' }}>
                            RECEIVER ACCOUNT PROFILE
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', rowGap: '6px', fontSize: '0.75rem', marginBottom: 12 }}>
                            <div style={{ color: 'var(--color-text-secondary)' }}>Account ID</div>
                            <div style={{ fontFamily: 'var(--font-mono)' }}>{tx.receiver_id}</div>
                            
                            <div style={{ color: 'var(--color-text-secondary)' }}>Fraud Score</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: getScoreColor(tx.receiver_score) }}>
                                {tx.receiver_score.toFixed(1)}/100
                            </div>
                            
                            <div style={{ color: 'var(--color-text-secondary)' }}>Structural Role</div>
                            <div>{tx.receiver_role}</div>
                            
                            <div style={{ color: 'var(--color-text-secondary)' }}>Ring Membership</div>
                            <div style={{ fontFamily: 'var(--font-mono)' }}>{tx.receiver_ring || 'None'}</div>
                            
                            <div style={{ color: 'var(--color-text-secondary)' }}>Compliance Flags</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                {tx.receiver_patterns?.length > 0 ? tx.receiver_patterns.map((p) => (
                                    <span key={p} className="pattern-chip" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>
                                        {PATTERN_LABELS[p] || p}
                                    </span>
                                )) : <span style={{ color: 'var(--color-text-dim)', fontStyle: 'italic' }}>None</span>}
                            </div>
                        </div>
                        <button 
                            className="btn-primary" 
                            style={{ width: '100%', padding: '6px 0', fontSize: '0.68rem' }}
                            onClick={() => onInspectAccount(tx.receiver_id)}
                        >
                            🔎 Inspect Full Receiver Forensics
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

export default function TransactionsPage() {
    const { result } = useAppContext();
    const navigate = useNavigate();
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
    const [selectedTx, setSelectedTx] = useState(null);
    const [selectedAccount, setSelectedAccount] = useState(null);

    if (!result) { navigate('/'); return null; }

    // Fetch transactions when query parameters change
    useEffect(() => {
        if (activeView !== 'transactions') return;

        let active = true;
        const fetchTxs = async () => {
            setTxLoading(true);
            try {
                const data = await getTransactions({
                    page: txPage,
                    limit: 50,
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
    }, [activeView, txPage, txSearch, txSortBy, txSortDir]);

    const handleTxSearchChange = (val) => {
        setTxSearch(val);
        setTxPage(1);
    };

    const toggleTxSort = (col) => {
        if (txSortBy === col) {
            setTxSortDir((d) => d === 'asc' ? 'desc' : 'asc');
        } else {
            setTxSortBy(col);
            setTxSortDir('desc');
        }
        setTxPage(1);
    };

    const TxSortIcon = ({ col }) => (
        <span style={{ color: txSortBy === col ? 'var(--color-accent)' : 'var(--color-text-dim)', marginLeft: 4, fontSize: '0.6rem' }}>
            {txSortBy === col ? (txSortDir === 'asc' ? '▲' : '▼') : '⬍'}
        </span>
    );

    const formatINR = (val) => {
        return Number(val || 0).toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const totalPages = Math.ceil(totalTxs / 50);

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

    const exportJSON = () => {
        const output = {
            suspicious_accounts: (result.suspicious_accounts || []).map((a) => ({
                account_id: a.account_id,
                verdict: a.verdict || 'APPROVE',
                suspicion_score: a.suspicion_score,
                structural_role: a.structural_role || 'LEAF',
                four_pillar_scores: a.four_pillar_scores || {},
                detected_patterns: a.detected_patterns || [],
                ring_id: a.ring_id || null,
            })),
            fraud_rings: (result.fraud_rings || []).map((r) => ({
                ring_id: r.ring_id,
                member_accounts: r.member_accounts || r.accounts || [],
                pattern_type: r.pattern_type || r.type || 'unknown',
                risk_score: r.risk_score ?? r.score ?? 0,
            })),
            summary: {
                total_accounts_analyzed: result.summary?.total_accounts_analyzed ?? 0,
                suspicious_accounts_flagged: result.summary?.suspicious_accounts_flagged ?? (result.suspicious_accounts || []).length,
                fraud_rings_detected: result.summary?.fraud_rings_detected ?? (result.fraud_rings || []).length,
                processing_time_seconds: result.summary?.processing_time_seconds ?? 0,
            },
        };
        const jsonStr = JSON.stringify(output, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'analysis_results.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleSort = (col) => {
        if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('desc'); }
    };

    const SortIcon = ({ col }) => (
        <span style={{ color: sortBy === col ? 'var(--color-accent)' : 'var(--color-text-dim)', marginLeft: 4, fontSize: '0.6rem' }}>
            {sortBy === col ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}
        </span>
    );

    return (
        <div className="max-w-[1560px] mx-auto px-6 py-6">
            
            {/* Header */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.4rem', letterSpacing: '0.1em' }}>
                    <span style={{ color: 'var(--color-accent)' }}>DATA</span> EXPLORER
                </h1>
                <p style={{ color: 'var(--color-text-dim)', fontSize: '0.72rem', marginTop: '4px' }}>
                    Forensics ledger details &middot; Audit profiles and transaction histories
                </p>
            </motion.div>

            {/* Toggle tabs */}
            <div className="flex gap-2 mt-6 mb-4 border-b border-[rgba(0,245,255,0.1)] pb-2">
                <button
                    onClick={() => setActiveView('accounts')}
                    style={{
                        padding: '10px 18px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        background: activeView === 'accounts' ? 'rgba(0, 245, 255, 0.08)' : 'transparent',
                        border: 'none',
                        borderBottom: activeView === 'accounts' ? '2.5px solid var(--color-accent)' : '2.5px solid transparent',
                        color: activeView === 'accounts' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    ▤ Suspicious Accounts ({result.suspicious_accounts?.length || 0})
                </button>
                <button
                    onClick={() => setActiveView('transactions')}
                    style={{
                        padding: '10px 18px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        background: activeView === 'transactions' ? 'rgba(0, 245, 255, 0.08)' : 'transparent',
                        border: 'none',
                        borderBottom: activeView === 'transactions' ? '2.5px solid var(--color-accent)' : '2.5px solid transparent',
                        color: activeView === 'transactions' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    ⇄ All Transactions Ledger
                </button>
            </div>

            {/* VIEW 1: SUSPICIOUS ACCOUNTS */}
            {activeView === 'accounts' && (
                <>
                    {/* Controls */}
                    <motion.div
                        className="glass-card p-4 mb-6 flex flex-wrap items-center gap-4"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="Search accounts, patterns, rings..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    background: 'rgba(0, 245, 255, 0.04)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    padding: '10px 14px',
                                    color: 'var(--color-text-primary)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.78rem',
                                    outline: 'none',
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            {['all', 'high', 'medium', 'low'].map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setFilterRisk(r)}
                                    className="btn-primary"
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '0.68rem',
                                        background: filterRisk === r ? 'rgba(0, 245, 255, 0.2)' : 'rgba(0, 245, 255, 0.05)',
                                        textTransform: 'capitalize',
                                    }}
                                >
                                    {r === 'all' ? 'All Risk' : `${r} Risk`}
                                </button>
                            ))}
                        </div>
                        <button className="btn-primary" onClick={exportJSON} style={{ padding: '6px 14px', fontSize: '0.7rem' }}>
                            ⬇ Export JSON
                        </button>
                    </motion.div>

                    {/* Table */}
                    <motion.div
                        className="glass-card overflow-hidden"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div style={{ maxHeight: 'calc(100vh - 320px)', overflow: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th onClick={() => toggleSort('id')} style={{ cursor: 'pointer' }}>
                                            Account ID <SortIcon col="id" />
                                        </th>
                                        <th onClick={() => toggleSort('score')} style={{ cursor: 'pointer' }}>
                                            Fraud Score <SortIcon col="score" />
                                        </th>
                                        <th onClick={() => toggleSort('patterns')} style={{ cursor: 'pointer' }}>
                                            Patterns <SortIcon col="patterns" />
                                        </th>
                                        <th onClick={() => toggleSort('ring')} style={{ cursor: 'pointer' }}>
                                            Ring ID <SortIcon col="ring" />
                                        </th>
                                        <th>Risk Level</th>
                                        <th>Explanation</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accounts.map((a) => (
                                        <tr 
                                            key={a.account_id}
                                            style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 245, 255, 0.02)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            onClick={() => setSelectedAccount(a.account_id)}
                                        >
                                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.75rem', color: 'var(--color-accent)', textDecoration: 'underline' }}>
                                                {a.account_id}
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <span className={`badge ${a.suspicion_score > 70 ? 'badge-high' : a.suspicion_score > 30 ? 'badge-medium' : 'badge-low'}`}>
                                                        {a.suspicion_score}
                                                    </span>
                                                    <div style={{ flex: 1, maxWidth: 80, height: 4, background: 'rgba(0,245,255,0.08)', borderRadius: 2 }}>
                                                        <div
                                                            style={{
                                                                height: '100%',
                                                                width: `${a.suspicion_score}%`,
                                                                borderRadius: 2,
                                                                background: a.suspicion_score > 70 ? 'var(--color-risk-red)' : a.suspicion_score > 30 ? 'var(--color-risk-orange)' : 'var(--color-risk-green)',
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex flex-wrap gap-1">
                                                    {a.detected_patterns.map((p) => (
                                                        <span key={p} className="pattern-chip">{p}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-accent)' }}>
                                                {a.ring_id || '—'}
                                            </td>
                                            <td>
                                                <span className={`badge ${a.suspicion_score > 70 ? 'badge-high' : a.suspicion_score > 30 ? 'badge-medium' : 'badge-low'}`}>
                                                    {a.suspicion_score > 70 ? 'HIGH RISK' : a.suspicion_score > 30 ? 'SUSPICIOUS' : 'LOW'}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '0.68rem', color: 'var(--color-text-dim)', maxWidth: '220px', fontFamily: 'var(--font-mono)' }}>
                                                {a.explanation || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                </>
            )}

            {/* VIEW 2: ALL TRANSACTIONS */}
            {activeView === 'transactions' && (
                <>
                    {/* Controls */}
                    <motion.div
                        className="glass-card p-4 mb-6 flex flex-wrap items-center gap-4"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="Search by Tx ID, Sender ID, or Receiver ID..."
                                value={txSearch}
                                onChange={(e) => handleTxSearchChange(e.target.value)}
                                style={{
                                    width: '100%',
                                    background: 'rgba(0, 245, 255, 0.04)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    padding: '10px 14px',
                                    color: 'var(--color-text-primary)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.78rem',
                                    outline: 'none',
                                }}
                            />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                            Total Ledger: <strong style={{ color: 'var(--color-accent)' }}>{totalTxs}</strong> transactions
                        </div>
                    </motion.div>

                    {/* Table */}
                    <motion.div
                        className="glass-card overflow-hidden"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                    >
                        {txLoading ? (
                            <div style={{ padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <div className="graph-spinner" />
                                <p style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-accent)' }}>
                                    RETRIEVING TRANSACTION ENTRIES...
                                </p>
                            </div>
                        ) : (
                            <div style={{ maxHeight: 'calc(100vh - 340px)', overflow: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th onClick={() => toggleTxSort('transaction_id')} style={{ cursor: 'pointer' }}>
                                                Transaction ID <TxSortIcon col="transaction_id" />
                                            </th>
                                            <th onClick={() => toggleTxSort('sender_id')} style={{ cursor: 'pointer' }}>
                                                Sender Account <TxSortIcon col="sender_id" />
                                            </th>
                                            <th onClick={() => toggleTxSort('receiver_id')} style={{ cursor: 'pointer' }}>
                                                Receiver Account <TxSortIcon col="receiver_id" />
                                            </th>
                                            <th onClick={() => toggleTxSort('amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                                                Amount <TxSortIcon col="amount" />
                                            </th>
                                            <th onClick={() => toggleTxSort('timestamp')} style={{ cursor: 'pointer' }}>
                                                Timestamp <TxSortIcon col="timestamp" />
                                            </th>
                                            <th>Compliance Risk</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {txs.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                                                    No transaction records found matching the query.
                                                </td>
                                            </tr>
                                        ) : (
                                            txs.map((tx) => (
                                                <tr
                                                    key={tx.transaction_id}
                                                    style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 245, 255, 0.02)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    onClick={() => setSelectedTx(tx)}
                                                >
                                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                                                        {tx.transaction_id}
                                                    </td>
                                                    <td>
                                                        <div 
                                                            className="flex items-center gap-2" 
                                                            style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedAccount(tx.sender_id);
                                                            }}
                                                        >
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>{tx.sender_id}</span>
                                                            <span className="pattern-chip" style={{ fontSize: '0.58rem', padding: '1px 4px' }}>{tx.sender_role}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div 
                                                            className="flex items-center gap-2" 
                                                            style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedAccount(tx.receiver_id);
                                                            }}
                                                        >
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>{tx.receiver_id}</span>
                                                            <span className="pattern-chip" style={{ fontSize: '0.58rem', padding: '1px 4px' }}>{tx.receiver_role}</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.75rem' }}>
                                                        {formatINR(tx.amount)}
                                                    </td>
                                                    <td style={{ fontSize: '0.72rem', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                                                        {tx.timestamp}
                                                    </td>
                                                    <td>
                                                        {tx.is_ring_transaction ? (
                                                            <span className="badge badge-high" style={{ fontSize: '0.58rem' }}>RING FRAUD</span>
                                                        ) : (tx.sender_score > 30 || tx.receiver_score > 30) ? (
                                                            <span className="badge badge-medium" style={{ fontSize: '0.58rem' }}>SUSPICIOUS</span>
                                                        ) : (
                                                            <span className="badge badge-low" style={{ fontSize: '0.58rem' }}>NORMAL</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>

                    {/* Pagination */}
                    {totalPages > 1 && !txLoading && (
                        <div className="flex items-center justify-between mt-4 px-1" style={{ fontSize: '0.72rem', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                            <div>
                                Showing {((txPage - 1) * 50) + 1}–{Math.min(totalTxs, txPage * 50)} of {totalTxs} transactions
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setTxPage(p => Math.max(1, p - 1))}
                                    disabled={txPage === 1}
                                    className="btn-primary"
                                    style={{ padding: '4px 10px', fontSize: '0.68rem', opacity: txPage === 1 ? 0.4 : 1, cursor: txPage === 1 ? 'not-allowed' : 'pointer' }}
                                >
                                    ◀ Prev
                                </button>
                                <span>
                                    Page {txPage} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setTxPage(p => Math.min(totalPages, p + 1))}
                                    disabled={txPage === totalPages}
                                    className="btn-primary"
                                    style={{ padding: '4px 10px', fontSize: '0.68rem', opacity: txPage === totalPages ? 0.4 : 1, cursor: txPage === totalPages ? 'not-allowed' : 'pointer' }}
                                >
                                    Next ▶
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* SIDE PANELS AND DRAWERS */}
            <AnimatePresence>
                {/* Node Inspector Drawer */}
                {selectedAccount && (
                    <NodeInspector
                        accountId={selectedAccount}
                        onClose={() => setSelectedAccount(null)}
                        onSelectAccount={(id) => setSelectedAccount(id)}
                        result={result}
                    />
                )}

                {/* Transaction Inspector Drawer */}
                {selectedTx && (
                    <TransactionInspector
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
