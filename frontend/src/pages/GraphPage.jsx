import { useState, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppContext } from '../App';
import NetworkGraph, { GRAPH_COLORS, ROLE_PALETTE } from '../components/NetworkGraph';
import NodeInspector from '../components/NodeInspector';
import { Icon, PageHead, EmptyState } from '../components/ui';
import { formatNum } from '../lib/format';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
];

function Dot({ color = '#8b877e', r = 4.5, stroke, sw = 0, size = 14 }) {
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={r} fill={color} stroke={stroke || 'none'} strokeWidth={sw} />
        </svg>
    );
}

const ROLE_ROWS = [
    ['HUB', 'Hub', 'Central aggregator'],
    ['BRIDGE', 'Bridge', 'Cross-network relay'],
    ['MULE', 'Mule', 'Forwarder'],
    ['LEAF', 'Leaf', 'Entry / exit point'],
];

function Legend({ open, onToggle }) {
    return (
        <div className="legend">
            <button onClick={onToggle} className="flex items-center justify-between w-full" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
                <span className="label">Legend</span>
                <Icon name="chevronDown" size={13} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s', color: 'var(--ink-3)' }} />
            </button>
            {open && (
                <div style={{ marginTop: 8 }}>
                    <div className="label" style={{ fontSize: '0.6rem', margin: '2px 0 4px' }}>Structural role</div>
                    {ROLE_ROWS.map(([k, name, d]) => (
                        <div key={k} className="legend-row">
                            <span className="legend-sw"><Dot color={ROLE_PALETTE[k].bg} /></span>
                            <span style={{ color: 'var(--ink)' }}>{name}</span>
                            <span style={{ color: 'var(--ink-4)', marginLeft: 'auto', paddingLeft: 10 }}>{d}</span>
                        </div>
                    ))}
                    <div style={{ height: 1, background: 'var(--line)', margin: '8px 0' }} />
                    <div className="label" style={{ fontSize: '0.6rem', margin: '2px 0 4px' }}>Risk</div>
                    <div className="legend-row">
                        <span className="flex items-end gap-1" style={{ width: 44 }}>
                            <Dot r={2.5} size={8} color="#8b877e" /><Dot r={4} size={11} color="#8b877e" /><Dot r={6} size={14} color="#8b877e" />
                        </span>
                        Size grows with score
                    </div>
                    <div className="legend-row"><span className="legend-sw"><Dot r={4.6} color="#5f5c55" stroke={GRAPH_COLORS.highRisk} sw={2} /></span>High risk · score &gt; 70</div>
                    <div className="legend-row"><span className="legend-sw"><Dot r={4.6} color="#5f5c55" stroke={GRAPH_COLORS.ring} sw={1.6} /></span>Fraud-ring member</div>
                    <div style={{ height: 1, background: 'var(--line)', margin: '8px 0' }} />
                    <div className="legend-row"><span className="legend-sw"><svg width="14" height="14"><path d="M1 7h12" stroke={GRAPH_COLORS.edgeRing} strokeWidth="1.8" /></svg></span>Intra-ring flow</div>
                    <div className="legend-row"><span className="legend-sw"><svg width="14" height="14"><path d="M1 7h12" stroke="rgba(120,170,225,0.6)" strokeWidth="1.6" /></svg></span>Transfer</div>
                </div>
            )}
        </div>
    );
}

export default function GraphPage() {
    const { result, graphData, setSelectedNode, selectedNode, showToast } = useAppContext();
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [legendOpen, setLegendOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 720);
    const apiRef = useRef(null);

    const nodesAll = useMemo(() => graphData?.nodes || [], [graphData]);
    const edgesAll = useMemo(() => graphData?.edges || [], [graphData]);

    const filteredData = useMemo(() => {
        if (filter === 'all') return { nodes: nodesAll, edges: edgesAll };
        const threshold = filter === 'high' ? 70 : filter === 'medium' ? 30 : 0;
        const maxThreshold = filter === 'high' ? 101 : filter === 'medium' ? 70 : 30;
        const filteredNodes = nodesAll.filter(
            (n) => n.suspicion_score >= threshold && n.suspicion_score < maxThreshold
        );
        const nodeIds = new Set(filteredNodes.map((n) => n.id));
        const filteredEdges = edgesAll.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
        return { nodes: filteredNodes, edges: filteredEdges };
    }, [nodesAll, edgesAll, filter]);

    const counts = useMemo(() => ({
        all: nodesAll.length,
        high: nodesAll.filter((n) => n.suspicion_score >= 70).length,
        medium: nodesAll.filter((n) => n.suspicion_score >= 30 && n.suspicion_score < 70).length,
        low: nodesAll.filter((n) => n.suspicion_score < 30).length,
    }), [nodesAll]);

    const onNodeClick = useCallback((nodeData) => {
        setSelectedNode(nodeData);
    }, [setSelectedNode]);

    const selectedId = selectedNode ? (selectedNode.id || selectedNode) : null;

    const runSearch = (e) => {
        e.preventDefault();
        const q = query.trim();
        if (!q) return;
        const exact = filteredData.nodes.find((n) => String(n.id).toLowerCase() === q.toLowerCase());
        const partial = exact || filteredData.nodes.find((n) => String(n.id).toLowerCase().includes(q.toLowerCase()));
        if (!partial) {
            showToast(`No account matching “${q}” in this view`, 'error');
            return;
        }
        if (apiRef.current?.has(partial.id)) {
            apiRef.current.focus(partial.id);
            setSelectedNode(partial);
        } else {
            showToast(`${partial.id} is outside the rendered subset — narrow the filter to see it`, 'info');
            setSelectedNode(partial);
        }
    };

    const highRisk = nodesAll.filter((n) => n.suspicion_score > 70).length;
    const safe = nodesAll.filter((n) => n.suspicion_score === 0).length;

    return (
        <div className="page" style={{ maxWidth: 'none', paddingBottom: 28 }}>
            <PageHead eyebrow="Network analysis" title="Transaction network" sub="Accounts are nodes; directed edges aggregate transfers between them. Hover for scores, select to open the account file.">
                <div className="seg" role="group" aria-label="Risk filter">
                    {FILTERS.map((f) => (
                        <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
                            {f.label} <span className="cnt">{formatNum(counts[f.key])}</span>
                        </button>
                    ))}
                </div>
                <form onSubmit={runSearch} className="field" style={{ width: 220 }}>
                    <Icon name="search" size={14} />
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find account ID" aria-label="Find account" />
                </form>
            </PageHead>

            <section className="panel" style={{ overflow: 'hidden' }}>
                <div className="graph-canvas" style={{ height: 'calc(100vh - 300px)', minHeight: 440 }}>
                    {filteredData.nodes.length === 0 ? (
                        <EmptyState icon="network" title="No accounts in this tier">Choose another risk filter to populate the network.</EmptyState>
                    ) : (
                        <NetworkGraph data={filteredData} onNodeClick={onNodeClick} apiRef={apiRef} selectedId={selectedId} />
                    )}

                    <div className="graph-overlay" style={{ top: 14, left: 14 }}>
                        <Legend open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />
                    </div>

                    <div className="graph-overlay graph-tools" style={{ top: 14, right: 14 }}>
                        <button onClick={() => apiRef.current?.zoom(1.3)} title="Zoom in" aria-label="Zoom in"><Icon name="plus" size={15} /></button>
                        <button onClick={() => apiRef.current?.zoom(1 / 1.3)} title="Zoom out" aria-label="Zoom out"><Icon name="minus" size={15} /></button>
                        <button onClick={() => apiRef.current?.fit()} title="Fit to view" aria-label="Fit to view"><Icon name="fit" size={15} /></button>
                    </div>
                </div>

                <div className="metric-strip" style={{ '--cols': 4, '--cols-md': 4, border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }}>
                    <div className="metric" style={{ padding: '12px 18px' }}>
                        <div className="metric-k">Nodes in view</div>
                        <div className="metric-v" style={{ fontSize: '1.2rem', marginTop: 6 }}>{formatNum(filteredData.nodes.length)}</div>
                    </div>
                    <div className="metric" style={{ padding: '12px 18px' }}>
                        <div className="metric-k">Edges in view</div>
                        <div className="metric-v" style={{ fontSize: '1.2rem', marginTop: 6 }}>{formatNum(filteredData.edges.length)}</div>
                    </div>
                    <div className={`metric ${highRisk > 0 ? 'crit' : ''}`} style={{ padding: '12px 18px' }}>
                        <div className="metric-k">High-risk nodes</div>
                        <div className="metric-v" style={{ fontSize: '1.2rem', marginTop: 6 }}>{formatNum(highRisk)}</div>
                    </div>
                    <div className="metric" style={{ padding: '12px 18px' }}>
                        <div className="metric-k">Safe nodes</div>
                        <div className="metric-v" style={{ fontSize: '1.2rem', marginTop: 6, color: 'var(--pos)' }}>{formatNum(safe)}</div>
                    </div>
                </div>
            </section>

            <AnimatePresence>
                {selectedNode && (
                    <NodeInspector
                        key="inspector"
                        accountId={selectedId}
                        onClose={() => setSelectedNode(null)}
                        onSelectAccount={(id) => setSelectedNode(id)}
                        result={result}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
