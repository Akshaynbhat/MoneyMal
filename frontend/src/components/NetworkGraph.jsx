import { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

const MAX_NODES = 400;

export default function NetworkGraph({ data, onNodeClick }) {
    const containerRef = useRef(null);
    const networkRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || !data) return;

        console.log('Sample node scores:', data.nodes.slice(0,5).map(n => ({
            id: n.id,
            raw_score: n.suspicion_score,
            parsed: parseFloat(n.suspicion_score),
            type: typeof n.suspicion_score
        })));
        console.log('Score distribution:', {
            high:   data.nodes.filter(n => parseFloat(n.suspicion_score) > 70).length,
            medium: data.nodes.filter(n => parseFloat(n.suspicion_score) > 30 && parseFloat(n.suspicion_score) <= 70).length,
            safe:   data.nodes.filter(n => parseFloat(n.suspicion_score) <= 30).length,
        });

        // CRITICAL: parse score as float — backend may send strings
        const scored = data.nodes.map(n => ({
            ...n,
            suspicion_score: parseFloat(n.suspicion_score) || 0
        }));

        const sorted = [...scored].sort((a, b) => b.suspicion_score - a.suspicion_score);
        const nodeSubset = sorted.slice(0, MAX_NODES);
        const nodeIds = new Set(nodeSubset.map(n => n.id));

        const nodes = new DataSet(
            nodeSubset.map((n) => {
                const score = n.suspicion_score;
                const isHigh   = score > 70;
                const isMedium = score > 30 && score <= 70;
                const riskColor = isHigh ? '#EF4444' : isMedium ? '#F59E0B' : '#00F5FF';
                const riskStatus = isHigh ? 'HIGH RISK' : isMedium ? 'SUSPICIOUS' : 'SAFE';

                return {
                    id: n.id,

                    // CRITICAL FIX: vis-network shows node id if label is ''
                    // Set label to a single space for safe/medium, real label for high
                    label: isHigh ? (n.label || String(n.id)) : ' ',
                    
                    title: `<div style="background: rgba(5,10,24,0.95); border: 1px solid rgba(0,245,255,0.2); border-radius: 6px; padding: 8px 12px; font-family: monospace; font-size: 11px;"><div style="color: #00F5FF; font-weight: bold;">${n.id}</div><div style="color: ${riskColor};">Score: ${score}</div><div style="color: ${riskColor}; font-weight: bold;">STATUS: ${riskStatus}</div></div>`,

                    color: {
                        background: isHigh   ? '#EF4444'
                                  : isMedium ? '#F59E0B'
                                  : '#1E2D45',
                        border:     isHigh   ? '#FF6B6B'
                                  : isMedium ? '#FCD34D'
                                  : '#2A3F5E',
                        highlight: {
                            background: isHigh ? '#FF6B6B' : isMedium ? '#FCD34D' : '#2A3F5E',
                            border: '#00F5FF',
                        },
                        hover: {
                            background: isHigh ? '#FF8888' : isMedium ? '#FBBF24' : '#2A3F5E',
                            border: '#00F5FF',
                        },
                    },

                    // CRITICAL FIX: do NOT set size in global options — only here per node
                    size: isHigh ? 18 : isMedium ? 9 : 4,

                    font: {
                        // CRITICAL FIX: use 0.1 not 0 — vis-network ignores 0
                        size: isHigh ? 11 : 0.1,
                        color: '#FFFFFF',
                        face: 'monospace',
                        strokeWidth: 3,
                        strokeColor: '#050A18',
                    },

                    shadow: {
                        enabled: isHigh || isMedium,
                        color:  isHigh   ? 'rgba(239,68,68,0.6)'
                               : isMedium ? 'rgba(245,158,11,0.4)'
                               : 'transparent',
                        size: isHigh ? 20 : 8,
                        x: 0, y: 0,
                    },

                    borderWidth: isHigh ? 2.5 : isMedium ? 1.5 : 0.5,
                    opacity: isHigh ? 1 : isMedium ? 0.9 : 0.5,
                    _raw: n,
                };
            })
        );

        // CRITICAL FIX: && not || — both endpoints must be in subset
        const edgeSubset = data.edges.filter(
            e => nodeIds.has(e.from) && nodeIds.has(e.to)
        );

        const edges = new DataSet(
            edgeSubset.map((e, i) => {
                const fromScore = parseFloat(scored.find(n => n.id === e.from)?.suspicion_score) || 0;
                const toScore   = parseFloat(scored.find(n => n.id === e.to)?.suspicion_score)   || 0;
                const isHighEdge   = fromScore > 70 || toScore > 70;
                const isMediumEdge = fromScore > 30 || toScore > 30;

                return {
                    id: `e-${i}`,
                    from: e.from,
                    to: e.to,
                    color: {
                        color:     isHighEdge   ? 'rgba(239,68,68,0.22)'
                                 : isMediumEdge ? 'rgba(245,158,11,0.10)'
                                 : 'rgba(0,245,255,0.03)',
                        highlight: 'rgba(239,68,68,0.7)',
                        hover:     'rgba(239,68,68,0.4)',
                    },
                    width: isHighEdge ? 1.2 : isMediumEdge ? 0.5 : 0.2,
                    arrows: { to: { enabled: true, scaleFactor: 0.3 } },
                    smooth: { type: 'curvedCW', roundness: 0.12 },
                };
            })
        );

        const options = {
            physics: {
                solver: 'barnesHut',
                barnesHut: {
                    gravitationalConstant: -12000,
                    centralGravity: 0.05,
                    springLength: 320,
                    springConstant: 0.015,
                    damping: 0.18,
                    avoidOverlap: 1.0,
                },
                stabilization: { iterations: 600, fit: true, updateInterval: 20 },
            },
            nodes: {
                shape: 'dot',
                // CRITICAL: no 'size' here — it overrides per-node size
                borderWidthSelected: 4,
            },
            edges: {
                scaling: { min: 0.2, max: 2 },
                selectionWidth: 2,
            },
            interaction: {
                hover: true,
                tooltipDelay: 60,
                zoomView: true,
                dragView: true,
                dragNodes: true,
                multiselect: true,
            },
        };

        const network = new Network(containerRef.current, { nodes, edges }, options);
        networkRef.current = network;

        network.on('stabilizationIterationsDone', () => {
            network.setOptions({ physics: { enabled: false } });
        });

        network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const rawNode = data.nodes.find(n => n.id === nodeId);
                if (rawNode && onNodeClick) onNodeClick(rawNode);
            }
        });

        return () => network.destroy();
    }, [data, onNodeClick]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#050A18', backgroundImage: 'radial-gradient(circle, rgba(200,220,255,0.06) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
            {data?.nodes?.length > MAX_NODES && (
                <div style={{
                    position: 'absolute', top: 10, left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(245,158,11,0.15)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 6, padding: '4px 14px',
                    fontSize: '0.68rem', color: '#F59E0B',
                    fontFamily: 'monospace', zIndex: 10,
                    pointerEvents: 'none', whiteSpace: 'nowrap',
                }}>
                    ⚠ Showing top {MAX_NODES} of {data.nodes.length} nodes
                </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
}
