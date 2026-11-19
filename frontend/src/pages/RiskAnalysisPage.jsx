import { useMemo, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { useAppContext } from '../App';
import NodeInspector from '../components/NodeInspector';
import { Icon, PageHead, Score, Verdict, EmptyState, tierOf } from '../components/ui';
import { formatNum, patternLabel } from '../lib/format';

const C = { crit: '#e8675c', warn: '#e6a94f', low: '#5fbf8f', sage: '#a6b79c', ink: '#5c9fe0' };
/* Categorical palette for pattern / ring-type donuts */
const PALETTE = ['#e8675c', '#ec8a4c', '#ecc556', '#5fbf8f', '#4dbfb0', '#5c9fe0', '#a27fe0', '#e07fb0'];
const AXIS = { fontSize: 11, fill: '#78746c', fontFamily: 'IBM Plex Mono, monospace' };

function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#1e1e1b', border: '1px solid rgba(236,231,220,0.22)', borderRadius: 4, padding: '8px 10px', fontSize: 12, color: 'var(--ink)', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}>
            <div className="mono" style={{ color: 'var(--ink-2)', marginBottom: 4 }}>{payload[0]?.payload?.fullId || label}</div>
            {payload.map((p, i) => (
                <div key={i} className="flex justify-between gap-4">
                    <span style={{ color: 'var(--ink-3)' }}>{p.name}</span>
                    <span className="mono">{p.value}</span>
                </div>
            ))}
        </div>
    );
}

function DonutPanel({ title, meta, data, labelOf, hintOf, capitalize }) {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    return (
        <section className="panel" style={{ minWidth: 0 }}>
            <div className="panel-head"><span className="panel-title">{title}</span>{meta && <span className="panel-meta">{meta}</span>}</div>
            {data.length === 0 ? <EmptyState title="Nothing detected" /> : (
                <div className="donut-wrap">
                    <div style={{ width: 200, height: 200, position: 'relative', flexShrink: 0 }}>
                        <ResponsiveContainer width={200} height={200}>
                            <PieChart>
                                <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="#181816" strokeWidth={2} isAnimationActive>
                                    {data.map((d, i) => <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />)}
                                </Pie>
                                <Tooltip content={<ChartTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
                            <div><div className="num" style={{ fontSize: '1.4rem' }}>{formatNum(total)}</div><div className="label" style={{ fontSize: '0.58rem' }}>Total</div></div>
                        </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, maxWidth: 520, maxHeight: 220, overflowY: 'auto' }}>
                        {data.map((d, i) => (
                            <div key={d.name} className="flex items-center gap-2" style={{ padding: '5px 0', fontSize: '0.78rem', borderBottom: '1px solid var(--line)' }}>
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                                <span className="mono" style={{ color: 'var(--ink)', textTransform: capitalize ? 'capitalize' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={hintOf?.(d.name) || d.name}>{labelOf(d.name)}</span>
                                <span className="num" style={{ marginLeft: 'auto', color: 'var(--ink-2)' }}>{formatNum(d.value)}</span>
                                <span className="num" style={{ color: 'var(--ink-4)', width: 38, textAlign: 'right' }}>{total ? ((d.value / total) * 100).toFixed(0) : 0}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

function ChartPanel({ title, meta, children, height = 260 }) {
    return (
        <section className="panel" style={{ minWidth: 0 }}>
            <div className="panel-head">
                <span className="panel-title">{title}</span>
                {meta && <span className="panel-meta">{meta}</span>}
            </div>
            <div style={{ padding: '16px 12px 8px 4px', height, minWidth: 0 }}>{children}</div>
        </section>
    );
}

const severity = (score) => (score > 80 ? { cls: 'crit', label: 'Critical' } : score > 50 ? { cls: 'warn', label: 'Warning' } : { cls: 'pos', label: 'Low' });

function Finding({ ring, open, onToggle, accountIndex, onOpenAccount, onLocate, innerRef }) {
    const sev = severity(ring.risk_score);
    const members = ring.member_accounts || [];
    const memberRows = members.map((id) => accountIndex.get(id) || { account_id: id, suspicion_score: 0, verdict: 'APPROVE', structural_role: '—', detected_patterns: [] });
    const blocked = memberRows.filter((m) => m.verdict === 'BLOCK').length;

    return (
        <div ref={innerRef} style={{ borderBottom: '1px solid var(--line)' }}>
            <button
                onClick={onToggle}
                aria-expanded={open}
                style={{ width: '100%', display: 'flex', alignItems: 'stretch', gap: 14, padding: '14px 18px', background: open ? 'rgba(236,231,220,0.02)' : 'transparent', border: 0, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}
            >
                <span className={`sev-rail ${sev.cls}`} />
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="flex items-center gap-2 flex-wrap">
                        <span className={`tag ${sev.cls}`}>{sev.label}</span>
                        <span style={{ fontSize: '0.9rem', textTransform: 'capitalize' }}>{ring.pattern_type} ring</span>
                        <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--ink-3)' }}>{ring.ring_id}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-3)', marginTop: 6 }}>
                        <span className="mono" style={{ color: 'var(--ink-2)' }}>{members.length}</span> member accounts
                        {blocked > 0 && <> · <span className="mono" style={{ color: 'var(--crit)' }}>{blocked}</span> with block verdict</>}
                    </span>
                </span>
                <span className="flex items-center gap-4" style={{ flexShrink: 0 }}>
                    <Score value={ring.risk_score} tier={sev.cls === 'pos' ? 'low' : sev.cls} width={70} />
                    <Icon name="chevronDown" size={15} style={{ color: 'var(--ink-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </span>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ padding: '0 18px 16px 35px' }}>
                            <div className="flex items-center justify-between gap-3 flex-wrap" style={{ margin: '2px 0 10px' }}>
                                <span className="label">Evidence · member accounts</span>
                                <button className="btn btn-sm" onClick={() => onLocate(members[0])}><Icon name="network" size={13} /> Locate in network</button>
                            </div>
                            <div className="panel table-wrap" style={{ maxHeight: 320, background: 'var(--bg)' }}>
                                <table className="data-table compact">
                                    <thead><tr><th>Account</th><th>Score</th><th>Verdict</th><th>Role</th><th>Patterns</th></tr></thead>
                                    <tbody>
                                        {memberRows.map((m) => (
                                            <tr key={m.account_id} className="clickable" onClick={() => onOpenAccount(m.account_id)}>
                                                <td><button className="link-id" onClick={(e) => { e.stopPropagation(); onOpenAccount(m.account_id); }}>{m.account_id}</button></td>
                                                <td><Score value={m.suspicion_score} tier={tierOf(m.suspicion_score)} width={48} /></td>
                                                <td><Verdict value={m.verdict} /></td>
                                                <td className="mono dim" style={{ fontSize: '0.72rem' }}>{m.structural_role}</td>
                                                <td>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(m.detected_patterns || []).slice(0, 3).map((p) => <span key={p} className="pattern-chip" title={patternLabel(p)}>{p}</span>)}
                                                        {(m.detected_patterns || []).length > 3 && <span className="pattern-chip">+{m.detected_patterns.length - 3}</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function RiskAnalysisPage() {
    const { result, setSelectedNode } = useAppContext();
    const location = useLocation();
    const navigate = useNavigate();
    const accounts = useMemo(() => result.suspicious_accounts || [], [result]);
    const rings = useMemo(() => result.fraud_rings || [], [result]);

    const [openRing, setOpenRing] = useState(location.state?.ringId || null);
    const [inspect, setInspect] = useState(null);
    const [sevFilter, setSevFilter] = useState('all');
    const ringRefs = useRef({});

    useEffect(() => {
        const id = location.state?.ringId;
        if (id && ringRefs.current[id]) {
            ringRefs.current[id].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [location.state]);

    const accountIndex = useMemo(() => new Map(accounts.map((a) => [a.account_id, a])), [accounts]);

    /* ── Chart Data ── */
    const scoreDistribution = useMemo(() => {
        const buckets = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'].map((range) => ({ range, count: 0 }));
        accounts.forEach((a) => {
            const idx = Math.min(Math.floor(a.suspicion_score / 10), 9);
            buckets[idx].count++;
        });
        return buckets;
    }, [accounts]);

    const top10 = useMemo(() =>
        [...accounts].sort((a, b) => b.suspicion_score - a.suspicion_score).slice(0, 10).map((a) => ({
            name: a.account_id.length > 14 ? a.account_id.slice(0, 14) + '…' : a.account_id,
            score: a.suspicion_score,
            fullId: a.account_id,
        })),
        [accounts]
    );

    const patternDist = useMemo(() => {
        const counts = {};
        accounts.forEach((a) => a.detected_patterns.forEach((p) => { counts[p] = (counts[p] || 0) + 1; }));
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [accounts]);

    const ringTypeData = useMemo(() => {
        const counts = {};
        rings.forEach((r) => { counts[r.pattern_type] = (counts[r.pattern_type] || 0) + 1; });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [rings]);

    const ringSizeData = useMemo(() =>
        rings.map((r) => ({ name: r.ring_id, members: r.member_accounts.length, risk: r.risk_score })),
        [rings]
    );

    const sortedRings = useMemo(() => {
        const list = [...rings].sort((a, b) => b.risk_score - a.risk_score);
        if (sevFilter === 'all') return list;
        return list.filter((r) => severity(r.risk_score).cls === sevFilter);
    }, [rings, sevFilter]);

    const sevCounts = useMemo(() => ({
        all: rings.length,
        crit: rings.filter((r) => r.risk_score > 80).length,
        warn: rings.filter((r) => r.risk_score > 50 && r.risk_score <= 80).length,
        pos: rings.filter((r) => r.risk_score <= 50).length,
    }), [rings]);

    const highRisk = accounts.filter((a) => a.suspicion_score > 70).length;
    const avgScore = accounts.length ? (accounts.reduce((s, a) => s + a.suspicion_score, 0) / accounts.length).toFixed(1) : '0';

    const locate = (id) => { if (!id) return; setSelectedNode(id); navigate('/graph'); };

    return (
        <div className="page">
            <PageHead eyebrow="Risk & findings" title="Findings register" sub="Coordinated groups ranked by risk, with the account-level evidence behind each one, followed by the score and pattern distribution for the whole run." />

            <section className="metric-strip" style={{ '--cols': 6 }} aria-label="Intelligence summary">
                <div className="metric"><div className="metric-k">Total accounts</div><div className="metric-v" style={{ color: 'var(--role-leaf)' }}>{formatNum(result.summary.total_accounts_analyzed)}</div></div>
                <div className="metric"><div className="metric-k">Flagged</div><div className="metric-v" style={{ color: 'var(--warn)' }}>{formatNum(result.summary.suspicious_accounts_flagged)}</div></div>
                <div className={`metric ${highRisk ? 'crit' : ''}`}><div className="metric-k">High risk</div><div className="metric-v">{formatNum(highRisk)}</div></div>
                <div className="metric"><div className="metric-k">Fraud rings</div><div className="metric-v" style={{ color: 'var(--role-bridge)' }}>{formatNum(result.summary.fraud_rings_detected)}</div></div>
                <div className="metric"><div className="metric-k">Avg score</div><div className="metric-v" style={{ color: 'var(--role-hub)' }}>{avgScore}</div></div>
                <div className="metric"><div className="metric-k">Processing</div><div className="metric-v" style={{ color: 'var(--pos)' }}>{result.summary.processing_time_seconds.toFixed(2)}<small>s</small></div></div>
            </section>

            {/* Findings */}
            <section className="panel mt-5" style={{ overflow: 'hidden' }}>
                <div className="panel-head" style={{ flexWrap: 'wrap' }}>
                    <div>
                        <div className="panel-title">Ring findings</div>
                        <div className="panel-meta">Severity: critical &gt; 80, warning &gt; 50 · expand a finding for its evidence</div>
                    </div>
                    <div className="seg" role="group" aria-label="Severity filter">
                        {[['all', 'All'], ['crit', 'Critical'], ['warn', 'Warning'], ['pos', 'Low']].map(([k, l]) => (
                            <button key={k} className={sevFilter === k ? 'on' : ''} onClick={() => setSevFilter(k)}>{l} <span className="cnt">{sevCounts[k]}</span></button>
                        ))}
                    </div>
                </div>
                {sortedRings.length === 0 ? (
                    <EmptyState icon="target" title={rings.length ? 'No findings at this severity' : 'No fraud rings detected'}>
                        {rings.length ? 'Choose another severity level.' : 'The engine found no coordinated groups in this dataset.'}
                    </EmptyState>
                ) : (
                    <div style={{ maxHeight: 640, overflowY: 'auto' }}>
                        {sortedRings.map((r) => (
                            <Finding
                                key={r.ring_id}
                                ring={r}
                                open={openRing === r.ring_id}
                                onToggle={() => setOpenRing((o) => (o === r.ring_id ? null : r.ring_id))}
                                accountIndex={accountIndex}
                                onOpenAccount={setInspect}
                                onLocate={locate}
                                innerRef={(el) => { ringRefs.current[r.ring_id] = el; }}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Distributions */}
            <div className="label" style={{ margin: '32px 0 12px' }}>Distribution analysis</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartPanel title="Fraud score distribution" meta="Flagged accounts per 10-point band">
                    <ResponsiveContainer width="100%" height={236} minWidth={0}>
                        <BarChart data={scoreDistribution} margin={{ left: 0, right: 8 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="range" tick={AXIS} axisLine={{ stroke: 'rgba(236,231,220,0.12)' }} tickLine={false} />
                            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(236,231,220,0.04)' }} />
                            <Bar dataKey="count" name="Accounts" radius={[2, 2, 0, 0]} maxBarSize={36}>
                                {scoreDistribution.map((entry, i) => <Cell key={i} fill={i >= 7 ? C.crit : i >= 3 ? C.warn : C.low} fillOpacity={0.85} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel title="Highest-risk accounts" meta="Top 10 by suspicion score">
                    <ResponsiveContainer width="100%" height={236} minWidth={0}>
                        <BarChart data={top10} layout="vertical" margin={{ left: 4, right: 12 }}>
                            <CartesianGrid horizontal={false} />
                            <XAxis type="number" tick={AXIS} domain={[0, 100]} axisLine={{ stroke: 'rgba(236,231,220,0.12)' }} tickLine={false} />
                            <YAxis dataKey="name" type="category" tick={{ ...AXIS, fontSize: 10, fill: '#aaa59a' }} width={118} axisLine={false} tickLine={false} interval={0} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(236,231,220,0.04)' }} />
                            <Bar dataKey="score" name="Score" radius={[0, 2, 2, 0]} maxBarSize={12}>
                                {top10.map((entry, i) => <Cell key={i} fill={entry.score > 70 ? C.crit : entry.score > 30 ? C.warn : C.low} fillOpacity={0.85} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartPanel>

                <DonutPanel title="Detected pattern types" meta="Accounts exhibiting each pattern" data={patternDist} labelOf={(n) => n} hintOf={(n) => (patternLabel(n) !== n ? patternLabel(n) : null)} />

                <ChartPanel title="Ring size & risk" meta={<span className="flex items-center gap-3"><span className="flex items-center gap-1"><i style={{ width: 8, height: 8, background: C.ink, display: 'inline-block' }} />Members</span><span className="flex items-center gap-1"><i style={{ width: 8, height: 8, background: C.crit, display: 'inline-block' }} />Risk</span></span>}>
                    {ringSizeData.length === 0 ? <EmptyState title="No rings" /> : (
                        <ResponsiveContainer width="100%" height={236} minWidth={0}>
                            <BarChart data={ringSizeData} margin={{ left: 0, right: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="name" tick={AXIS} axisLine={{ stroke: 'rgba(236,231,220,0.12)' }} tickLine={false} />
                                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(236,231,220,0.04)' }} />
                                <Bar dataKey="members" fill={C.ink} fillOpacity={0.75} radius={[2, 2, 0, 0]} name="Members" maxBarSize={22} />
                                <Bar dataKey="risk" fill={C.crit} fillOpacity={0.75} radius={[2, 2, 0, 0]} name="Risk score" maxBarSize={22} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartPanel>

                <div className="lg:col-span-2">
                    <DonutPanel title="Mule types detected" meta="Rings by pattern type" data={ringTypeData} labelOf={(n) => n} capitalize />
                </div>
            </div>

            <AnimatePresence>
                {inspect && (
                    <NodeInspector key="acc" accountId={inspect} onClose={() => setInspect(null)} onSelectAccount={setInspect} result={result} />
                )}
            </AnimatePresence>
        </div>
    );
}
