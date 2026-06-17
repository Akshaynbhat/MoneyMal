import { useState, useEffect, useRef, useCallback } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

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
                size: 11,
                color: {
                    background: '#3498db',
                    border: '#2980b9',
                    highlight: { background: '#FFFFFF', border: '#00E5FF' },
                },
                font: { size: 10, color: '#E8EAF6', face: 'monospace' },
            },
            edges: {
                color: 'rgba(80,160,220,0.35)',
                arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                smooth: { type: 'curvedCW', roundness: 0.15 },
            },
            interaction: { hover: true, tooltipDelay: 50 },
        };

        const network = new Network(containerRef.current, {
            nodes: nodesRef.current,
            edges: edgesRef.current
        }, options);
        networkRef.current = network;

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
            const res = await axios.post('http://localhost:8000/api/analyze', form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const jobId = res.data.job_id;

            // Poll for result
            let completed = false;
            while (!completed) {
                await new Promise(r => setTimeout(r, 1000));
                const pollRes = await axios.get(`http://localhost:8000/api/result/${jobId}`);
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
                const color = score > 70 ? '#ff3b3b' : score > 30 ? '#ff9f1c' : '#3498db';
                const size = score > 70 ? 20 : score > 30 ? 15 : 11;
                nodesRef.current.update({
                    id: accId,
                    color: { background: color, border: '#ffffff' },
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
                font: { size: 8, color: 'rgba(255,255,255,0.4)', background: 'rgba(10,14,26,0.8)' }
            });

            setProgressIndex(prev => prev + 1);

            // Trigger analysis every 10 transactions
            if (processedTxnsRef.current.length % 10 === 0) {
                runIncrementalAnalysis();
            }
        }, intervalMs);

        return () => clearInterval(timer);
    }, [isPlaying, allTxns, progressIndex, speed, runIncrementalAnalysis]);

    return (
        <div className="max-w-[1600px] mx-auto px-6 py-6" style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header controls */}
            <div className="flex items-center justify-between mb-4 glass-card p-4">
                <div>
                    <h1 style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '0.1em', margin: 0 }}>
                        ⚡ <span style={{ color: 'var(--color-accent)' }}>LIVE</span> FRAUD MONITOR
                    </h1>
                    <p style={{ color: 'var(--color-text-dim)', fontSize: '0.65rem', margin: '2px 0 0 0' }}>
                        Simulating transaction streams with real-time graph mapping and score evaluations
                    </p>
                </div>
                
                <div className="flex items-center gap-4">
                    {!fileName ? (
                        <label className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.75rem', cursor: 'pointer' }}>
                            Upload CSV File
                            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>{fileName}</span>
                            <button className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.65rem' }} onClick={resetSimulation}>Change</button>
                        </div>
                    )}

                    <button className="btn-primary" disabled={allTxns.length === 0} onClick={() => setIsPlaying(!isPlaying)}>
                        {isPlaying ? '⏸ PAUSE' : '▶ START'}
                    </button>
                    <button className="btn-secondary" onClick={resetSimulation}>
                        ↺ RESET
                    </button>

                    <div className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: 'var(--color-text-dim)' }}>Speed:</span>
                        <select 
                            value={speed} 
                            onChange={(e) => setSpeed(Number(e.target.value))} 
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '3px 8px', borderRadius: 4 }}
                        >
                            <option value={1}>1 txn/s (Slow)</option>
                            <option value={5}>5 txns/s (Med)</option>
                            <option value={15}>15 txns/s (Fast)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* KPI metrics bar */}
            <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="glass-card p-3 text-center">
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                        {progressIndex} / {allTxns.length}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transactions Processed</div>
                </div>
                <div className="glass-card p-3 text-center">
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#00E5FF' }}>
                        {nodesRef.current ? nodesRef.current.length : 0}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Graph Nodes</div>
                </div>
                <div className="glass-card p-3 text-center">
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#ff3b3b' }}>
                        {totalAlertsCount}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Triggered Alerts</div>
                </div>
                <div className="glass-card p-3 text-center">
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: highScore > 70 ? '#ff3b3b' : highScore > 30 ? '#ff9f1c' : '#00E5FF' }}>
                        {highScore.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Threat Score</div>
                </div>
            </div>

            {/* Main content grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
                <div className="flex flex-col gap-4 lg:col-span-1 min-h-0">
                    
                    {/* Live Alerts Box */}
                    <div className="glass-card p-4 flex-1 flex flex-col min-h-0" style={{ borderColor: alerts.length > 0 ? 'rgba(255, 59, 59, 0.25)' : 'rgba(255, 255, 255, 0.05)' }}>
                        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: '#ff3b3b', marginBottom: 12 }}>
                            🚨 FRAUD ALERTS FEED
                        </h2>
                        
                        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
                            <AnimatePresence>
                                {alerts.map((alert) => (
                                    <motion.div 
                                        key={alert.key}
                                        className="p-3"
                                        initial={{ opacity: 0, x: -30 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        style={{ background: 'rgba(255,59,59,0.08)', borderLeft: '3px solid #ff3b3b', borderRadius: '4px' }}
                                    >
                                        <div className="flex justify-between items-start" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                                            <span style={{ fontWeight: 'bold', color: '#fff' }}>{alert.account_id}</span>
                                            <span className="badge badge-high" style={{ padding: '1px 5px', fontSize: '0.6rem' }}>{alert.score.toFixed(0)}</span>
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#ff8a8a', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                                            {ALERT_LABELS[alert.pattern] || alert.pattern}
                                        </div>
                                        <div style={{ display: 'flex', justifycontent: 'space-between', fontSize: '0.6rem', color: 'var(--color-text-dim)', marginTop: 4 }}>
                                            <span>{getBankName(alert.account_id)}</span>
                                            <span>{alert.timestamp}</span>
                                        </div>
                                    </motion.div>
                                ))}
                                {alerts.length === 0 && (
                                    <div className="flex-1 flex items-center justify-center text-center p-4">
                                        <p style={{ color: 'var(--color-text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                                            Waiting for data... <br />Flagged threats will appear here.
                                        </p>
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Scrolling Transaction Ledger */}
                    <div className="glass-card p-4" style={{ height: '220px', display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                            ▩ TRANSACTION LEDGER
                        </h2>
                        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 font-mono text-[0.65rem] text-[#8b949e]">
                            {processedTxns.map((tx, idx) => (
                                <div key={`${tx.transaction_id}-${idx}`} className="flex justify-between p-1 hover:bg-[rgba(255,255,255,0.02)] rounded">
                                    <span style={{ color: 'var(--color-accent)' }}>{tx.sender_id.split('_').slice(1).join('_') || tx.sender_id} ➔ {tx.receiver_id.split('_').slice(1).join('_') || tx.receiver_id}</span>
                                    <span style={{ color: '#fff', fontWeight: 'bold' }}>₹{Number(tx.amount).toLocaleString()}</span>
                                </div>
                            ))}
                            {processedTxns.length === 0 && (
                                <div className="flex-1 flex items-center justify-center text-center text-gray-500">
                                    Queue idle
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Vis.js Canvas */}
                <div className="lg:col-span-3 glass-card relative min-h-0" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: isPlaying ? '#ff3b3b' : '#8b949e',
                            boxShadow: isPlaying ? '0 0 8px #ff3b3b' : 'none',
                            animation: isPlaying ? 'live-blink 1.2s infinite' : 'none'
                        }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: isPlaying ? '#ff3b3b' : 'var(--color-text-dim)', letterSpacing: '0.08em', fontWeight: 'bold' }}>
                            {isPlaying ? 'LIVE STREAM RUNNING' : 'STREAM STOPPED'}
                        </span>
                    </div>

                    <div ref={containerRef} style={{ flex: 1, width: '100%', height: '100%' }} />
                </div>
            </div>

            <style>{`
                @keyframes live-blink {
                    0% { opacity: 0.3; }
                    50% { opacity: 1; }
                    100% { opacity: 0.3; }
                }
            `}</style>
        </div>
    );
}
