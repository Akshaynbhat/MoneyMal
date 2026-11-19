import { useState, useEffect, useRef, useCallback } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { API_BASE } from '../services/api';
import { Icon, PageHead, EmptyState } from '../components/ui';

// Mappings for pretty alert names
const ALERT_LABELS = {
    'F1_FAST_PASSTHROUGH': 'F1: Fast Passthrough',
    'F2_DORMANT_BURST': 'F2: Dormant Burst',
    'F3_MICRO_SMURFING': 'F3: Micro-Smurfing',
    'F4_MACRO_VOLUME_OUTLIER': 'F4: Macro Volume Outlier',
    'F5_RAPID_OUTBOUND': 'F5: Rapid Outbound',
    'F6_COORDINATED_GROUP': 'F6: Coordinated Group',
    'F7_OUTLIER_TXN': 'F7: Outlier Transaction',
    'F8_NEW_ACC_HIGH_VAL': 'F8: New Account High Value',
    'F10_CROSS_BANK_LAYERING': 'F10: Cross-Bank Layering',
    'cycle_length_3': 'Circular Loop (L3)',
    'cycle_length_4': 'Circular Loop (L4)',
    'cycle_length_5': 'Circular Loop (L5)',
    'shell_account': 'Shell Intermediary',
    'smurfing': 'Smurfing Pattern',
    'threshold_breach': 'Limit Threshold Breach',
    'high_velocity': 'High-Velocity Transfer',
};

const getBankName = (accountId) => {
    if (!accountId) return 'N/A';
    const parts = accountId.split('_');
    if (parts.length >= 2 && parts[0] === 'BNK') return `Bank ${parts[1]}`;
    return 'Internal / Unknown';
};

export default function LiveTrackingPage() {
    const [fileText, setFileText] = useState('');
    const [fileName, setFileName] = useState('');
    const [allTxns, setAllTxns] = useState([]);
    const [processedTxns, setProcessedTxns] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1); // 1 = 1 txn/sec, 5 = 5 txn/sec, 15 = 15 txn/sec
    const [progressIndex, setProgressIndex] = useState(0);
    const [alerts, setAlerts] = useState([]);
    
    // Core KPIs
    const [totalAlertsCount, setTotalAlertsCount] = useState(0);
    const [highScore, setHighScore] = useState(0.0);
    const [analyzing, setAnalyzing] = useState(false);

    const containerRef = useRef(null);
    const networkRef = useRef(null);
    const nodesRef = useRef(null);
    const edgesRef = useRef(null);
    const processedTxnsRef = useRef([]);
    const userMovedRef = useRef(false);

    // Parse CSV locally
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileName(file.name);
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            setFileText(text);
            
            const lines = text.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            const txnList = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const cols = lines[i].split(',').map(c => c.trim());
                if (cols.length < headers.length) continue;
                
                const row = {};
                headers.forEach((h, idx) => {
                    row[h] = cols[idx];
                });
                txnList.push(row);
            }
            
            // Sort by timestamp
            txnList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            setAllTxns(txnList);
            resetSimulation();
        };
        reader.readAsText(file);
    };

    const resetSimulation = () => {
        setIsPlaying(false);
        setProgressIndex(0);
        setProcessedTxns([]);
        processedTxnsRef.current = [];
        setAlerts([]);
        setTotalAlertsCount(0);
        setHighScore(0.0);
        
        userMovedRef.current = false;
        if (nodesRef.current) nodesRef.current.clear();
        if (edgesRef.current) edgesRef.current.clear();
    };

    // Initialize Vis.js Graph once on mount
    useEffect(() => {
        if (!containerRef.current) return;

        nodesRef.current = new DataSet([]);
        edgesRef.current = new DataSet([]);

        const options = {
            physics: {
                solver: 'barnesHut',
                barnesHut: {
                    gravitationalConstant: -3000,
                    springLength: 90,
                    springConstant: 0.04,
                    damping: 0.09,
                    avoidOverlap: 0.5,
                },
                stabilization: false,
            },
            nodes: {
                shape: 'dot',
                color: {
                    background: '#5f5c55',
                    border: '#4a4843',
                    highlight: { background: '#5f5c55', border: '#bccbb2' },
                    hover: { background: '#5f5c55', border: '#ece7dc' },
                },
                size: 8,
                font: { size: 10, color: '#8b877e', face: 'IBM Plex Mono, monospace', strokeWidth: 3, strokeColor: '#141412' },
            },
            edges: {
                color: { color: 'rgba(236,231,220,0.14)', highlight: 'rgba(188,203,178,0.9)', hover: 'rgba(236,231,220,0.4)' },
                arrows: { to: { enabled: true, scaleFactor: 0.45 } },
                smooth: { type: 'curvedCW', roundness: 0.15 },
            },
            interaction: { hover: true, tooltipDelay: 50 },
        };

        const network = new Network(containerRef.current, {
            nodes: nodesRef.current,
            edges: edgesRef.current
        }, options);
        networkRef.current = network;

        // Keep the growing graph framed until the analyst zooms or pans themselves
        network.on('zoom', () => { userMovedRef.current = true; });
        network.on('dragEnd', (p) => { if (!p.nodes?.length) userMovedRef.current = true; });
        network.on('stabilized', () => {
            if (!userMovedRef.current) network.fit({ animation: false, maxZoomLevel: 1 });
        });

        return () => {
            if (networkRef.current) networkRef.current.destroy();
        };
    }, []);

    // Trigger Backend Analysis on currently streamed subset
    const runIncrementalAnalysis = useCallback(async () => {
        const currentTxns = processedTxnsRef.current;
        if (currentTxns.length < 3 || analyzing) return;
        setAnalyzing(true);

        try {
            const csvRows = ['transaction_id,sender_id,receiver_id,amount,timestamp'];
            currentTxns.forEach(tx => {
                csvRows.push(`${tx.transaction_id || tx.txn_id},${tx.sender_id},${tx.receiver_id},${tx.amount},${tx.timestamp}`);
            });
            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            
            const form = new FormData();
            form.append('file', blob, 'stream_data.csv');

            // Send to FastAPI
            const res = await axios.post(`${API_BASE}/analyze`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const jobId = res.data.job_id;

            // Poll for result
            let completed = false;
            while (!completed) {
                await new Promise(r => setTimeout(r, 1000));
                const pollRes = await axios.get(`${API_BASE}/result/${jobId}`);
                if (pollRes.data.status === 'done') {
                    completed = true;
                    handleAnalysisResult(pollRes.data.result);
                } else if (pollRes.data.status === 'error') {
                    completed = true;
                }
            }
        } catch (err) {
            console.error('Real-time analysis failed', err);
        } finally {
            setAnalyzing(false);
        }
    }, [analyzing]);

    // Update node styles and trigger alerts on response
    const handleAnalysisResult = (result) => {
        const suspiciousAccs = result.suspicious_accounts || [];
        const newAlerts = [];
        let localHighScore = 0.0;

        suspiciousAccs.forEach(acc => {
            const accId = acc.account_id;
            const score = acc.suspicion_score;
            if (score > localHighScore) localHighScore = score;

            // Update Vis.js Node color and size dynamically
            if (nodesRef.current.get(accId)) {
                const color = score > 70 ? '#cf7166' : score > 30 ? '#d3a45c' : '#5f5c55';
                const size = score > 70 ? 15 : score > 30 ? 11 : 8;
                nodesRef.current.update({
                    id: accId,
                    color: { background: color, border: score > 30 ? '#ece7dc' : '#4a4843', highlight: { background: color, border: '#bccbb2' } },
                    font: { color: score > 30 ? '#ece7dc' : '#8b877e' },
                    size: size
                });
            }

            // Map triggered alerts
            if (score >= 40) {
                acc.detected_patterns.forEach(pat => {
                    const alertKey = `${accId}-${pat}`;
                    newAlerts.push({
                        key: alertKey,
                        account_id: accId,
                        pattern: pat,
                        score: score,
                        timestamp: new Date().toLocaleTimeString()
                    });
                });
            }
        });

        if (localHighScore > highScore) setHighScore(localHighScore);

        setAlerts(prev => {
            const existingKeys = new Set(prev.map(a => a.key));
            const uniqueNew = newAlerts.filter(a => !existingKeys.has(a.key));
            if (uniqueNew.length > 0) {
                setTotalAlertsCount(c => c + uniqueNew.length);
                return [...uniqueNew, ...prev].slice(0, 50); // Keep last 50 alerts
            }
            return prev;
        });
    };

    // Keep the growing graph framed while streaming, until the analyst zooms or pans
    useEffect(() => {
        if (!isPlaying) return;
        const t = setInterval(() => {
            const net = networkRef.current;
            if (!net || userMovedRef.current || !nodesRef.current?.length) return;
            net.fit({ animation: false, maxZoomLevel: 1 });
        }, 1000);
        return () => clearInterval(t);
    }, [isPlaying]);

    // Replay loop ticker
    useEffect(() => {
        if (!isPlaying || allTxns.length === 0 || progressIndex >= allTxns.length) {
            if (progressIndex >= allTxns.length && allTxns.length > 0) {
                setIsPlaying(false);
            }
            return;
        }

        const intervalMs = Math.max(100, 1000 / speed);
        const timer = setInterval(() => {
            const nextTxn = allTxns[progressIndex];
            if (!nextTxn) return;

            setProcessedTxns(prev => [nextTxn, ...prev].slice(0, 40));
            processedTxnsRef.current = [...processedTxnsRef.current, nextTxn];

            // Add Sender node if missing
            const senderId = nextTxn.sender_id;
            if (!nodesRef.current.get(senderId)) {
                nodesRef.current.add({
                    id: senderId,
                    label: senderId,
                });
            }

            // Add Receiver node if missing
            const receiverId = nextTxn.receiver_id;
            if (!nodesRef.current.get(receiverId)) {
                nodesRef.current.add({
                    id: receiverId,
                    label: receiverId,
                });
            }

            // Add transaction directed link
            edgesRef.current.add({
                from: senderId,
                to: receiverId,
                label: `₹${Number(nextTxn.amount).toLocaleString()}`,
                font: { size: 8, color: 'rgba(236,231,220,0.38)', face: 'IBM Plex Mono, monospace', strokeWidth: 3, strokeColor: '#141412' }
            });

            setProgressIndex(prev => prev + 1);


            // Trigger analysis every 10 transactions
            if (processedTxnsRef.current.length % 10 === 0) {
                runIncrementalAnalysis();
            }
        }, intervalMs);

        return () => clearInterval(timer);
    }, [isPlaying, allTxns, progressIndex, speed, runIncrementalAnalysis]);


    const pct = allTxns.length ? (progressIndex / allTxns.length) * 100 : 0;
    const finished = allTxns.length > 0 && progressIndex >= allTxns.length;
    const nodeCount = nodesRef.current ? nodesRef.current.length : 0;

    return (
        <div className="page" style={{ maxWidth: 'none', minHeight: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>
            <PageHead
                eyebrow="Simulation"
                title="Live monitor"
                sub="Replays a ledger locally in timestamp order and re-scores the growing graph with the engine every 10 transactions."
            >
                <label className="btn" style={{ cursor: 'pointer' }}>
                    <Icon name="intake" size={14} /> {fileName ? 'Replace file' : 'Load CSV'}
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                </label>
                <button className="btn btn-solid" disabled={allTxns.length === 0 || finished} onClick={() => setIsPlaying(!isPlaying)}>
                    <Icon name={isPlaying ? 'pause' : 'play'} size={14} /> {isPlaying ? 'Pause' : progressIndex > 0 ? 'Resume' : 'Start'}
                </button>
                <button className="btn" onClick={resetSimulation} disabled={allTxns.length === 0}>
                    <Icon name="refresh" size={14} /> Reset
                </button>
                <select className="select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed" style={{ height: 32 }}>
                    <option value={1}>1 txn/s</option>
                    <option value={5}>5 txn/s</option>
                    <option value={15}>15 txn/s</option>
                </select>
            </PageHead>

            {/* KPI strip */}
            <section className="metric-strip" style={{ '--cols': 4, '--cols-md': 4 }}>
                <div className="metric">
                    <div className="metric-k">Processed</div>
                    <div className="metric-v">{progressIndex.toLocaleString('en-IN')}<small>/ {allTxns.length.toLocaleString('en-IN')}</small></div>
                    <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="metric">
                    <div className="metric-k">Graph nodes</div>
                    <div className="metric-v">{nodeCount.toLocaleString('en-IN')}</div>
                    <div className="metric-n">Accounts seen so far</div>
                </div>
                <div className={`metric ${totalAlertsCount > 0 ? 'crit' : ''}`}>
                    <div className="metric-k">Alerts triggered</div>
                    <div className="metric-v">{totalAlertsCount}</div>
                    <div className="metric-n">Score ≥ 40, per pattern</div>
                </div>
                <div className={`metric ${highScore > 70 ? 'crit' : highScore > 30 ? 'warn' : ''}`}>
                    <div className="metric-k">Peak score</div>
                    <div className="metric-v">{highScore.toFixed(1)}</div>
                    <div className="metric-n">Highest account score</div>
                </div>
            </section>

            <div className="live-grid grid gap-5 mt-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                <div className="live-side grid gap-5">
                    {/* Alerts */}
                    <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                        <div className="panel-head">
                            <span className="panel-title">Alert feed</span>
                            <span className="panel-meta">{alerts.length > 0 ? `Latest ${alerts.length}` : 'Idle'}</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <AnimatePresence initial={false}>
                                {alerts.map((alert) => (
                                    <motion.div
                                        key={alert.key}
                                        initial={{ opacity: 0, y: -6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        style={{ display: 'flex', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line)' }}
                                    >
                                        <span className={`sev-rail ${alert.score > 70 ? 'crit' : 'warn'}`} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="mono" style={{ fontSize: '0.8rem' }}>{alert.account_id}</span>
                                                <span className="num" style={{ fontSize: '0.78rem', color: alert.score > 70 ? 'var(--crit)' : 'var(--warn)' }}>{alert.score.toFixed(0)}</span>
                                            </div>
                                            <div style={{ fontSize: '0.76rem', color: 'var(--ink-2)', marginTop: 3 }}>{ALERT_LABELS[alert.pattern] || alert.pattern}</div>
                                            <div className="flex justify-between" style={{ fontSize: '0.68rem', color: 'var(--ink-4)', marginTop: 3 }}>
                                                <span>{getBankName(alert.account_id)}</span>
                                                <span className="mono">{alert.timestamp}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {alerts.length === 0 && (
                                <EmptyState icon="alert" title="No alerts yet">Accounts scoring 40 or more appear here as the stream is analysed.</EmptyState>
                            )}
                        </div>
                    </section>

                    {/* Ledger */}
                    <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                        <div className="panel-head">
                            <span className="panel-title">Stream</span>
                            <span className="panel-meta">Last 40 transactions</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {processedTxns.map((tx, idx) => (
                                <div key={`${tx.transaction_id}-${idx}`} className="flex items-center justify-between gap-3 mono" style={{ padding: '6px 16px', fontSize: '0.72rem', borderBottom: '1px solid var(--line)' }}>
                                    <span style={{ color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {tx.sender_id.split('_').slice(1).join('_') || tx.sender_id}
                                        <span style={{ color: 'var(--ink-4)', margin: '0 6px' }}>→</span>
                                        {tx.receiver_id.split('_').slice(1).join('_') || tx.receiver_id}
                                    </span>
                                    <span className="num" style={{ color: 'var(--ink)', flexShrink: 0 }}>₹{Number(tx.amount).toLocaleString()}</span>
                                </div>
                            ))}
                            {processedTxns.length === 0 && (
                                <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--ink-3)' }}>Queue idle</div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Graph canvas */}
                <section className="panel graph-canvas live-canvas" style={{ overflow: 'hidden' }}>
                    <div className="graph-overlay flex items-center gap-3" style={{ top: 14, left: 14 }}>
                        <span className="tag" style={{ background: 'var(--bg-raised)', color: isPlaying ? 'var(--ink)' : 'var(--ink-3)' }}>
                            <span className={`status-dot ${isPlaying ? 'live' : ''}`} />
                            {isPlaying ? 'Streaming' : finished ? 'Stream complete' : 'Stopped'}
                        </span>
                        {analyzing && (
                            <span className="tag" style={{ background: 'var(--bg-raised)' }}>
                                <span className="spinner" style={{ width: 10, height: 10 }} /> Scoring
                            </span>
                        )}
                        {fileName && <span className="tag muted hide-sm" style={{ background: 'var(--bg-raised)' }}>{fileName}</span>}
                    </div>
                    {processedTxns.length === 0 && (
                        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 1 }}>
                            <EmptyState icon="live" title={allTxns.length ? 'Ready to stream' : 'No stream loaded'}>
                                {allTxns.length ? `${allTxns.length.toLocaleString('en-IN')} transactions queued. Press Start.` : 'Load a CSV with transaction_id, sender_id, receiver_id, amount and timestamp columns.'}
                            </EmptyState>
                        </div>
                    )}
                    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
                </section>
            </div>
        </div>
    );
}
