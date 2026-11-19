import { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

export default function MiniGraph({ data }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || !data) return;

        // Subsample for mini view (max 100 nodes)
        const maxNodes = 100;
        const nodeSubset = data.nodes.length > maxNodes
            ? data.nodes.slice(0, maxNodes)
            : data.nodes;
        const nodeIds = new Set(nodeSubset.map(n => n.id));

        const nodes = new DataSet(
            nodeSubset.map((n) => ({
                id: n.id,
                color: {
                    background: n.suspicion_score > 70 ? '#e8675c' : n.suspicion_score > 30 ? '#e6a94f' : '#5c9fe0',
                    border: n.suspicion_score > 70 ? '#e8675c' : n.suspicion_score > 30 ? '#e6a94f' : '#5c9fe0',
                },
                size: n.suspicion_score > 70 ? 7 : n.suspicion_score > 30 ? 5 : 3.5,
                borderWidth: 1,
            }))
        );

        const edgeSubset = data.edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
        const edges = new DataSet(
            edgeSubset.map((e, i) => ({
                id: `e-${i}`,
                from: e.from,
                to: e.to,
                color: { color: 'rgba(120,170,225,0.16)' },
                width: 0.3,
                arrows: { to: { enabled: false } },
            }))
        );

        const options = {
            physics: {
                barnesHut: { gravitationalConstant: -2000, centralGravity: 0.3, springLength: 60, damping: 0.15 },
                stabilization: { iterations: 100 },
            },
            nodes: { shape: 'dot', borderWidth: 1 },
            edges: { width: 0.3 },
            interaction: { dragNodes: false, dragView: false, zoomView: false, selectable: false },
        };

        const network = new Network(containerRef.current, { nodes, edges }, options);
        network.on('stabilizationIterationsDone', () => network.setOptions({ physics: { enabled: false } }));

        return () => network.destroy();
    }, [data]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
