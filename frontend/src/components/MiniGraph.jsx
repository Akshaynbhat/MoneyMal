import { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

export default function MiniGraph({ data }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || !data) return;

        // CRITICAL: parse score as float — backend may send strings
        const scored = data.nodes.map(n => ({
            ...n,
            suspicion_score: parseFloat(n.suspicion_score) || 0
        }));

        const MAX_NODES = 50;
        const sorted = [...scored].sort((a, b) => b.suspicion_score - a.suspicion_score);
        const nodeSubset = sorted.slice(0, MAX_NODES);
        const nodeIds = new Set(nodeSubset.map(n => n.id));

        const nodes = new DataSet(
            nodeSubset.map((n) => ({
                id: n.id,
                color: {
                    background: n.suspicion_score > 70 ? '#EF4444' : n.suspicion_score > 30 ? '#F59E0B' : '#1E2D45',
                    border: n.suspicion_score > 70 ? '#FF6B6B' : n.suspicion_score > 30 ? '#FCD34D' : '#2A3F5E',
                },
                size: n.suspicion_score > 70 ? 8 : n.suspicion_score > 30 ? 5 : 3,
                borderWidth: n.suspicion_score > 70 ? 2 : n.suspicion_score > 30 ? 1 : 0.5,
                opacity: n.suspicion_score > 70 ? 1 : n.suspicion_score > 30 ? 0.9 : 0.5,
            }))
        );

        const edgeSubset = data.edges
            .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .slice(0, 80);
        const edges = new DataSet(
            edgeSubset.map((e, i) => {
                const fromScore = parseFloat(scored.find(n => n.id === e.from)?.suspicion_score) || 0;
                const toScore   = parseFloat(scored.find(n => n.id === e.to)?.suspicion_score)   || 0;
                const isHighRisk = fromScore > 70 || toScore > 70;
                const isMedium = (fromScore > 30 && fromScore <= 70) || (toScore > 30 && toScore <= 70);

                return {
                    id: `e-${i}`,
                    from: e.from,
                    to: e.to,
                    color: { 
                        color: isHighRisk ? 'rgba(239, 68, 68, 0.18)' : isMedium ? 'rgba(245, 158, 11, 0.12)' : 'rgba(0, 245, 255, 0.05)'
                    },
                    width: isHighRisk ? 1.0 : isMedium ? 0.6 : 0.3,
                    arrows: { to: { enabled: false } },
                };
            })
        );

        const options = {
            physics: {
                barnesHut: { gravitationalConstant: -4500, centralGravity: 0.3, springLength: 130, damping: 0.2 },
                stabilization: { iterations: 100 },
            },
            nodes: { shape: 'dot', borderWidth: 1 },
            edges: { width: 0.3 },
            interaction: { dragNodes: false, dragView: false, zoomView: false, selectable: false, hover: false },
        };

        const network = new Network(containerRef.current, { nodes, edges }, options);
        network.on('stabilizationIterationsDone', () => network.setOptions({ physics: { enabled: false } }));

        return () => network.destroy();
    }, [data]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
