import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../App';
import FraudRingTable from '../components/FraudRingTable';
import MiniGraph from '../components/MiniGraph';
import RiskGauge from '../components/RiskGauge';
import { Icon, PageHead, Score, Verdict, tierOf } from '../components/ui';
import { formatNum, patternLabel } from '../lib/format';

const reveal = (i = 0) => ({
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: 0.04 * i, ease: [0.2, 0.7, 0.2, 1] },
});

function BarRow({ label, value, total, tone }) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div style={{ padding: '7px 0' }}>
            <div className="flex items-center justify-between" style={{ fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--ink-2)' }}>{label}</span>
                <span className="num">{formatNum(value)} <span style={{ color: 'var(--ink-4)', marginLeft: 6 }}>{pct.toFixed(0)}%</span></span>
            </div>
            <div style={{ height: 3, background: 'var(--line)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 2 }} />
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { result, graphData, setSelectedNode, file } = useAppContext();
    const navigate = useNavigate();
    const s = result.summary;

    const stats = useMemo(() => {
        const accounts = result.suspicious_accounts || [];
        const rings = result.fraud_rings || [];
        const highRisk = accounts.filter((a) => a.suspicion_score > 70).length;
        const avgScore = accounts.length > 0
            ? (accounts.reduce((sum, a) => sum + a.suspicion_score, 0) / accounts.length).toFixed(1)
            : '0.0';
        const totalRingMembers = rings.reduce((sum, r) => sum + r.member_accounts.length, 0);
        const verdicts = { BLOCK: 0, REVIEW: 0, APPROVE: 0 };
        accounts.forEach((a) => { const v = a.verdict || 'APPROVE'; verdicts[v] = (verdicts[v] || 0) + 1; });
        const ringTypes = {};
        rings.forEach((r) => { ringTypes[r.pattern_type] = (ringTypes[r.pattern_type] || 0) + 1; });
        return { highRisk, avgScore, totalRingMembers, accounts, rings, verdicts, ringTypes };
    }, [result]);

    const flaggedPct = s.total_accounts_analyzed > 0 ? (s.suspicious_accounts_flagged / s.total_accounts_analyzed) * 100 : 0;

    const openAccount = (id) => { setSelectedNode(id); navigate('/graph'); };

    return (
        <div className="page">
            <PageHead
                eyebrow="Investigation overview"
                title="Case summary"
                sub={<>
                    {file ? <span className="mono" style={{ color: 'var(--ink)' }}>{file.name}</span> : 'Current dataset'} — {formatNum(s.total_accounts_analyzed)} accounts analysed in{' '}
                    <span className="mono">{s.processing_time_seconds.toFixed(2)}s</span>.
                </>}
            >
                <Link to="/graph" className="btn"><Icon name="network" size={14} /> Open network</Link>
                <Link to="/risk" className="btn"><Icon name="risk" size={14} /> Review findings</Link>
            </PageHead>

            {/* Key figures */}
            <motion.section className="metric-strip" style={{ '--cols': 5 }} {...reveal(0)} aria-label="Key figures">
                <div className="metric">
                    <div className="metric-k">Accounts analysed</div>
                    <div className="metric-v">{formatNum(s.total_accounts_analyzed)}</div>
                    <div className="metric-n">Nodes in transaction graph</div>
                </div>
                <div className="metric">
                    <div className="metric-k">Flagged accounts</div>
                    <div className="metric-v">{formatNum(s.suspicious_accounts_flagged)}</div>
                    <div className="metric-n"><span className="mono">{flaggedPct.toFixed(1)}%</span> of all accounts</div>
                </div>
                <div className={`metric ${stats.highRisk > 0 ? 'crit' : ''}`}>
                    <div className="metric-k">High-risk mules</div>
                    <div className="metric-v">{formatNum(stats.highRisk)}</div>
                    <div className="metric-n">Suspicion score above 70</div>
                </div>
                <div className="metric">
                    <div className="metric-k">Fraud rings</div>
                    <div className="metric-v">{formatNum(s.fraud_rings_detected)}</div>
                    <div className="metric-n"><span className="mono">{formatNum(stats.totalRingMembers)}</span> member accounts</div>
                </div>
                <div className="metric">
                    <div className="metric-k">Mean score</div>
                    <div className="metric-v">{stats.avgScore}<small>/100</small></div>
                    <div className="metric-n">Across flagged accounts</div>
                </div>
            </motion.section>

            <div className="grid gap-5 mt-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                {/* Priority accounts */}
                <motion.section className="panel" {...reveal(1)} style={{ minWidth: 0, alignSelf: 'start' }}>
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">Priority accounts</div>
                            <div className="panel-meta">Highest suspicion scores · select an account to locate it in the network</div>
                        </div>
                        <Link to="/transactions" className="btn btn-sm">All accounts <Icon name="arrowRight" size={13} /></Link>
                    </div>
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Account</th>
                                    <th>Score</th>
                                    <th>Verdict</th>
                                    <th>Patterns</th>
                                    <th>Ring</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(result.suspicious_accounts || []).slice(0, 8).map((a) => (
                                    <tr key={a.account_id} className="clickable" onClick={() => openAccount(a.account_id)}>
                                        <td><button className="link-id" onClick={(e) => { e.stopPropagation(); openAccount(a.account_id); }}>{a.account_id}</button></td>
                                        <td><Score value={a.suspicion_score} tier={tierOf(a.suspicion_score)} /></td>
                                        <td><Verdict value={a.verdict} /></td>
                                        <td>
                                            <div className="flex gap-1" style={{ flexWrap: 'nowrap' }}>
                                                {a.detected_patterns.slice(0, 2).map((p) => <span key={p} className="pattern-chip" title={patternLabel(p)}>{p}</span>)}
                                                {a.detected_patterns.length > 2 && <span className="pattern-chip" title={a.detected_patterns.slice(2).join(', ')}>+{a.detected_patterns.length - 2}</span>}
                                            </div>
                                        </td>
                                        <td className="mono dim" style={{ fontSize: '0.76rem' }}>{a.ring_id && a.ring_id !== 'NONE' ? a.ring_id : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {(result.suspicious_accounts || []).length === 0 && (
                            <div className="empty"><div className="empty-title">No accounts flagged</div><div className="empty-text">Every account scored zero in this run.</div></div>
                        )}
                    </div>
                </motion.section>

                {/* Right rail */}
                <div className="grid gap-5 content-start">
                    <motion.section className="panel" {...reveal(2)}>
                        <div className="panel-head">
                            <span className="panel-title">Transaction network</span>
                            <span className="panel-meta mono">{formatNum(graphData?.nodes?.length)} nodes · {formatNum(graphData?.edges?.length)} edges</span>
                        </div>
                        <button
                            onClick={() => navigate('/graph')}
                            className="graph-canvas"
                            style={{ display: 'block', width: '100%', height: 190, border: 0, cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                            aria-label="Open the transaction network"
                        >
                            <MiniGraph data={graphData} />
                        </button>
                        <div className="flex items-center justify-between" style={{ padding: '10px 18px', fontSize: '0.74rem', color: 'var(--ink-3)' }}>
                            <span>Preview of first 100 nodes</span>
                            <Link to="/graph" style={{ color: 'var(--ink-2)', textDecoration: 'none' }} className="flex items-center gap-1">Explore <Icon name="arrowRight" size={12} /></Link>
                        </div>
                    </motion.section>

                    <motion.section className="panel" {...reveal(3)}>
                        <div className="panel-head"><span className="panel-title">Threat level</span><span className="panel-meta">Mean flagged score</span></div>
                        <div className="panel-body">
                            <RiskGauge score={parseFloat(stats.avgScore)} />
                        </div>
                        <div style={{ padding: '0 18px 14px', borderTop: '1px solid var(--line)' }}>
                            <div className="label" style={{ padding: '14px 0 2px' }}>Enforcement verdicts</div>
                            <BarRow label="Block" value={stats.verdicts.BLOCK || 0} total={stats.accounts.length} tone="var(--crit)" />
                            <BarRow label="Review" value={stats.verdicts.REVIEW || 0} total={stats.accounts.length} tone="var(--warn)" />
                            <BarRow label="Approve" value={stats.verdicts.APPROVE || 0} total={stats.accounts.length} tone="var(--ink-3)" />
                        </div>
                    </motion.section>
                </div>
            </div>

            {/* Ring register */}
            <motion.section className="panel mt-5" {...reveal(4)}>
                <div className="panel-head">
                    <div>
                        <div className="panel-title">Fraud ring register</div>
                        <div className="panel-meta">
                            {Object.entries(stats.ringTypes).map(([k, v], i) => (
                                <span key={k}>{i > 0 && ' · '}<span className="mono">{v}</span> {k}</span>
                            ))}
                            {Object.keys(stats.ringTypes).length === 0 && 'No rings'}
                        </div>
                    </div>
                    <Link to="/risk" className="btn btn-sm">Findings <Icon name="arrowRight" size={13} /></Link>
                </div>
                <FraudRingTable rings={result.fraud_rings} onSelect={(ring) => navigate('/risk', { state: { ringId: ring.ring_id } })} />
            </motion.section>
        </div>
    );
}
