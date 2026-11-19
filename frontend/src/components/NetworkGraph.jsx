import { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

/* ─── Visual encoding (matches the README's Structural Roles table) ──────────
   Colour  = structural role: HUB purple, BRIDGE orange, MULE yellow, LEAF blue
   Size    = risk tier (score > 70 large, > 30 medium, else small)
   Outline = red for high-risk accounts (score > 70), ivory for ring members
   Sage    = current selection                                               */
export const ROLE_PALETTE = {
    HUB: { bg: '#a27fe0', border: '#8a66cc' },
    BRIDGE: { bg: '#ec8a4c', border: '#d27236' },
    MULE: { bg: '#ecc556', border: '#d4ac3e' },
    LEAF: { bg: '#5c9fe0', border: '#4686c6' },
};
export const GRAPH_COLORS = {
    highRisk: '#ff5a4e',
    ring: '#f3efe6',
    select: '#c9dcbc',
    edge: 'rgba(120,170,225,0.22)',
    edgeRing: 'rgba(255,110,96,0.55)',
    edgeHi: 'rgba(201,220,188,0.85)',
};
const roleColor = (r) => ROLE_PALETTE[r] || ROLE_PALETTE.LEAF;

const tier = (s) => (s > 70 ? 'crit' : s > 30 ? 'warn' : 'low');
const inr = (v) => (v != null ? '₹' + Number(v).toLocaleString('en-IN') : '–');

/* Tooltip built as DOM (vis-network renders string titles as plain text). */
function buildTooltip(n) {
    const el = document.createElement('div');
    el.className = 'gtip';
    const p = n.four_pillar_scores || {};
    const mult = Number(p.Multiplier ?? 1);
    const add = (parent, tag, cls, text) => {
        const c = document.createElement(tag);
        if (cls) c.className = cls;
        if (text != null) c.textContent = text;
        parent.appendChild(c);
        return c;
    };
    const row = (parent, k, v, color) => {
        const r = add(parent, 'div', 'gtip-row');
        add(r, 'span', null, k);
        const val = add(r, 'span', null, v);
        if (color) val.style.color = color;
    };

    const h = add(el, 'div', 'gtip-h');
    add(h, 'span', 'gtip-id', String(n.id));
    const roleEl = add(h, 'span', 'gtip-role', n.structural_role || 'LEAF');
    roleEl.style.color = roleColor(n.structural_role).bg;

    const t = tier(n.suspicion_score);
    const tone = t === 'crit' ? 'var(--crit)' : t === 'warn' ? 'var(--warn)' : 'var(--ink-2)';
    const vTone = n.verdict === 'BLOCK' ? 'var(--crit)' : n.verdict === 'REVIEW' ? 'var(--warn)' : 'var(--pos)';
    row(el, 'Suspicion score', `${Number(n.suspicion_score).toFixed(1)} / 100`, tone);
    row(el, 'Verdict', n.verdict || 'APPROVE', vTone);

    const g = add(el, 'div', 'gtip-grid');
    row(g, 'GAT', `${p.GAT ?? 0}/35`);
    row(g, 'LSTM', `${p.LSTM ?? 0}/25`);
    row(g, 'EIF', `${p.EIF ?? 0}/20`);
    row(g, 'Rules', `${p.Rules ?? 0}/20`);
    row(el, 'Role multiplier', `${mult.toFixed(2)}×`);
    row(el, 'Received', inr(n.total_incoming));
    row(el, 'Sent', inr(n.total_outgoing));
    row(el, 'Rings', (n.ring_ids || []).join(', ') || 'None');
    const pats = (n.detected_patterns || []).join(', ');
    if (pats) {
        const d = add(el, 'div', null, pats);
        d.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-family:var(--font-mono);font-size:10.5px;color:var(--ink-2);';
    }
    return el;
}

function edgeTooltip(title) {
    if (!title) return undefined;
    const el = document.createElement('div');
    el.className = 'gtip';
    el.style.minWidth = '0';
    el.style.fontFamily = 'var(--font-mono)';
    el.textContent = title;
    return el;
}

/* ─── Component ─── */
export default function NetworkGraph({ data, onNodeClick, apiRef, selectedId }) {
    const containerRef = useRef(null);
    const networkRef = useRef(null);
    const [stabilized, setStabilized] = useState(false);
    const [capped, setCapped] = useState(false);
    const [renderedCount, setRenderedCount] = useState(0);

    useEffect(() => {
        if (!containerRef.current || !data || !data.nodes.length) return;
        setStabilized(false);

        // Safeguard to prevent browser tab crash/freeze on dense datasets
        const MAX_RENDER_NODES = 400;
        const isCapped = data.nodes.length > MAX_RENDER_NODES;
        setCapped(isCapped);

        let renderedNodes = data.nodes;
        let renderedEdges = data.edges;

        if (isCapped) {
            renderedNodes = [...data.nodes]
                .sort((a, b) => (b.suspicion_score || 0) - (a.suspicion_score || 0))
                .slice(0, MAX_RENDER_NODES);
            const nodeIds = new Set(renderedNodes.map((n) => n.id));
            renderedEdges = data.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
        }
        setRenderedCount(renderedNodes.length);

        const showAllLabels = renderedNodes.length <= 120;
        const ringOf = new Map(renderedNodes.map((n) => [n.id, new Set(n.ring_ids || [])]));

        /* ── nodes ── */
        const nodes = new DataSet(
            renderedNodes.map((n) => {
                const t = tier(n.suspicion_score);
                const c = roleColor(n.structural_role || 'LEAF');
                const inRing = (n.ring_ids || []).length > 0;
                const high = t === 'crit';
                const size = high ? 24 : t === 'warn' ? 17 : 11;
                const border = high ? GRAPH_COLORS.highRisk : inRing ? GRAPH_COLORS.ring : c.border;
                return {
                    id: n.id,
                    label: showAllLabels || t !== 'low' ? String(n.label || n.id) : undefined,
                    title: buildTooltip(n),
                    shape: 'dot',
                    color: {
                        background: c.bg,
                        border,
                        highlight: { background: c.bg, border: GRAPH_COLORS.select },
                        hover: { background: c.bg, border: GRAPH_COLORS.ring },
                    },
                    size,
                    borderWidth: high ? 3.5 : inRing ? 2.5 : 1.5,
                    borderWidthSelected: 4,
                    shadow: high ? { enabled: true, color: 'rgba(255,90,78,0.35)', size: 14, x: 0, y: 0 } : { enabled: false },
                    font: {
                        size: t === 'low' ? 12 : 13,
                        color: t === 'low' ? '#a9a59c' : '#f3efe6',
                        face: 'IBM Plex Mono, ui-monospace, monospace',
                        strokeWidth: 3,
                        strokeColor: '#141412',
                        vadjust: 2,
                    },
                };
            })
        );

        /* ── edges ── */
        const edges = new DataSet(
            renderedEdges.map((e, i) => {
                const a = ringOf.get(e.from);
                const b = ringOf.get(e.to);
                let intraRing = false;
                if (a && b && a.size && b.size) for (const r of a) if (b.has(r)) { intraRing = true; break; }
                return {
                    id: `e-${i}`,
                    from: e.from,
                    to: e.to,
                    value: e.value || 1,
                    title: edgeTooltip(e.title),
                    color: {
                        color: intraRing ? GRAPH_COLORS.edgeRing : GRAPH_COLORS.edge,
                        highlight: GRAPH_COLORS.edgeHi,
                        hover: 'rgba(236,231,220,0.45)',
                        inherit: false,
                    },
                    arrows: { to: { enabled: true, scaleFactor: 0.45, type: 'arrow' } },
                    smooth: { type: 'curvedCW', roundness: 0.14 },
                    width: 1,
                    selectionWidth: (w) => w * 1.15,
                    hoverWidth: 0.8,
                    scaling: { min: 0.6, max: 3.5 },
                };
            })
        );

        /* ── options ── */
        const bigGraph = data.nodes.length > 300;
        const options = {
            autoResize: true,
            layout: { improvedLayout: !bigGraph },
            physics: {
                solver: 'barnesHut',
                barnesHut: {
                    gravitationalConstant: -6000,
                    centralGravity: 0.12,
                    springLength: 170,
                    springConstant: 0.04,
                    damping: 0.13,
                    avoidOverlap: 0.65,
                },
                stabilization: {
                    enabled: true,
                    iterations: bigGraph ? 150 : 300,
                    updateInterval: 30,
                    fit: true,
                },
                minVelocity: 0.75,
            },
            nodes: { borderWidth: 1, borderWidthSelected: 3 },
            edges: { width: 1, scaling: { min: 0.6, max: 3.5 } },
            interaction: {
                hover: true,
                tooltipDelay: 120,
                zoomView: true,
                dragView: true,
                dragNodes: true,
                multiselect: false,
                hideEdgesOnDrag: bigGraph,
                hideEdgesOnZoom: bigGraph,
                keyboard: false,
                selectConnectedEdges: true,
            },
        };

        /* ── mount ── */
        if (networkRef.current) { networkRef.current.destroy(); networkRef.current = null; }
        const network = new Network(containerRef.current, { nodes, edges }, options);
        networkRef.current = network;

        network.on('stabilizationIterationsDone', () => {
            network.setOptions({ physics: { enabled: false } });
            network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
            setStabilized(true);
        });

        network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const rawNode = data.nodes.find((n) => String(n.id) === String(nodeId));
                if (rawNode && onNodeClick) onNodeClick(rawNode);
            }
        });

        network.on('hoverNode', () => { if (containerRef.current) containerRef.current.style.cursor = 'pointer'; });
        network.on('blurNode', () => { if (containerRef.current) containerRef.current.style.cursor = 'default'; });

        return () => {
            if (networkRef.current) { networkRef.current.destroy(); networkRef.current = null; }
        };
    }, [data]); // onNodeClick intentionally omitted — stable callback, avoids full re-render

    /* Imperative controls for the toolbar (zoom / fit / focus) */
    useEffect(() => {
        if (!apiRef) return;
        apiRef.current = {
            zoom(factor) {
                const n = networkRef.current; if (!n) return;
                n.moveTo({ scale: n.getScale() * factor, animation: { duration: 220, easingFunction: 'easeInOutQuad' } });
            },
            fit() {
                networkRef.current?.fit({ animation: { duration: 450, easingFunction: 'easeInOutQuad' } });
            },
            focus(id) {
                const n = networkRef.current; if (!n) return false;
                const exists = n.body?.data?.nodes?.get(id);
                if (!exists) return false;
                n.selectNodes([id]);
                n.focus(id, { scale: Math.max(1.1, n.getScale()), animation: { duration: 550, easingFunction: 'easeInOutQuad' } });
                return true;
            },
            has(id) { return !!networkRef.current?.body?.data?.nodes?.get(id); },
        };
    });

    /* Keep the canvas selection in sync with the inspector */
    useEffect(() => {
        const n = networkRef.current;
        if (!n || !stabilized) return;
        if (selectedId && n.body?.data?.nodes?.get(selectedId)) {
            n.selectNodes([selectedId]);
            n.focus(selectedId, { scale: Math.max(1.1, n.getScale()), animation: { duration: 550, easingFunction: 'easeInOutQuad' } });
        } else if (!selectedId) {
            n.unselectAll();
        }
    }, [selectedId, stabilized]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {capped && stabilized && (
                <div className="graph-overlay tag warn" style={{ bottom: 14, left: 14, pointerEvents: 'none' }}>
                    Performance mode · top {renderedCount} of {data.nodes.length.toLocaleString('en-IN')} nodes by score
                </div>
            )}

            {!stabilized && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
                    background: 'rgba(20,20,18,0.88)',
                }}>
                    <div className="spinner" />
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-3)' }}>Laying out network…</p>
                </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
}
