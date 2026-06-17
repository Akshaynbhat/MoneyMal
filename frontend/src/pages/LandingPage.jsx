import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../App';
import { previewMapping } from '../services/api';

/* ── Particle Network Background ── */
function ParticleCanvas() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animId;
        let particles = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.r = Math.random() * 2 + 1;
                this.alpha = Math.random() * 0.5 + 0.1;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 245, 255, ${this.alpha})`;
                ctx.fill();
            }
        }

        for (let i = 0; i < 80; i++) particles.push(new Particle());

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p) => { p.update(); p.draw(); });

            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(0, 245, 255, ${0.08 * (1 - dist / 150)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
            animId = requestAnimationFrame(animate);
        }
        animate();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />;
}

/* ── Column Mapping Preview Card ── */
function MappingPreviewCard({ mappingPreview, mappingLoading, mappingError }) {
    if (mappingLoading) {
        return (
            <motion.div
                className="glass-card mt-6 p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ textAlign: 'left' }}
            >
                <p style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    ◌ Analyzing column structure...
                </p>
            </motion.div>
        );
    }

    if (mappingError) {
        return (
            <motion.div
                className="glass-card mt-6 p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ textAlign: 'left', borderColor: 'rgba(255,59,59,0.3)' }}
            >
                <p style={{ color: 'var(--color-risk-red)', fontSize: '0.8rem' }}>
                    ✕ Preview failed: {mappingError}
                </p>
            </motion.div>
        );
    }

    if (!mappingPreview) return null;

    const { mapping, warnings, preview_rows, total_rows, total_columns } = mappingPreview;

    const matchIcon = (matchType) => {
        if (!matchType) return '✕';
        if (matchType === 'exact') return '✓';
        if (matchType.startsWith('alias')) return '↪';
        if (matchType.startsWith('fuzzy')) return '≈';
        return '?';
    };

    const matchColor = (matchType) => {
        if (!matchType) return 'var(--color-risk-red)';
        if (matchType === 'exact') return 'var(--color-risk-green)';
        if (matchType.startsWith('alias')) return 'var(--color-accent)';
        return '#f59e0b';
    };

    return (
        <motion.div
            className="glass-card mt-6 p-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'left' }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 700, letterSpacing: '0.08em' }}>
                    COLUMN MAPPING PREVIEW
                </p>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>
                    {total_rows.toLocaleString()} rows · {total_columns} cols
                </span>
            </div>

            {/* Mapping rows */}
            <div style={{ display: 'grid', gap: '6px', marginBottom: warnings.length > 0 ? '12px' : '0' }}>
                {Object.entries(mapping).map(([canonical, info]) => (
                    <div key={canonical} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: matchColor(info?.match_type), fontFamily: 'var(--font-mono)', fontSize: '0.8rem', minWidth: '16px' }}>
                            {matchIcon(info?.match_type)}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-primary)', minWidth: '130px' }}>
                            {canonical}
                        </span>
                        {info ? (
                            <>
                                <span style={{ color: 'var(--color-text-dim)', fontSize: '0.7rem' }}>←</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: info.match_type === 'exact' ? 'var(--color-risk-green)' : 'var(--color-accent)' }}>
                                    {info.original_column}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', marginLeft: '4px' }}>
                                    ({info.match_type})
                                </span>
                            </>
                        ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-risk-red)' }}>
                                not found
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
                <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                    {warnings.map((w, i) => (
                        <p key={i} style={{ color: '#f59e0b', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', marginBottom: i < warnings.length - 1 ? '4px' : 0 }}>
                            ⚠ {w}
                        </p>
                    ))}
                </div>
            )}

            {/* Preview table */}
            {preview_rows && preview_rows.length > 0 && (
                <div style={{ marginTop: '14px' }}>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-dim)', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        FIRST {preview_rows.length} ROWS (MAPPED)
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
                            <thead>
                                <tr>
                                    {Object.keys(preview_rows[0]).map((col) => (
                                        <th key={col} style={{
                                            padding: '4px 8px',
                                            textAlign: 'left',
                                            color: 'var(--color-accent)',
                                            borderBottom: '1px solid rgba(0,245,255,0.15)',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {preview_rows.map((row, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        {Object.values(row).map((val, j) => (
                                            <td key={j} style={{
                                                padding: '4px 8px',
                                                color: 'var(--color-text-secondary)',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '160px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}>
                                                {String(val)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

export default function LandingPage() {
    const { file, setFile, analyze, loading, error, progress, showToast } = useAppContext();
    const navigate = useNavigate();
    const [dragOver, setDragOver] = useState(false);
    const [mappingPreview, setMappingPreview] = useState(null);
    const [mappingLoading, setMappingLoading] = useState(false);
    const [mappingError, setMappingError] = useState(null);

    const handleFile = useCallback(async (f) => {
        if (f && f.name.endsWith('.csv')) {
            setFile(f);
            showToast(`Loaded: ${f.name} (${(f.size / 1024).toFixed(0)} KB)`, 'success');

            // Trigger column mapping preview
            setMappingLoading(true);
            setMappingPreview(null);
            setMappingError(null);
            try {
                const result = await previewMapping(f);
                setMappingPreview(result);
            } catch (err) {
                setMappingError(err?.response?.data?.detail || err.message || 'Preview failed');
            } finally {
                setMappingLoading(false);
            }
        } else {
            showToast('Please upload a CSV file', 'error');
        }
    }, [setFile, showToast]);

    const handleAnalyze = useCallback(async () => {
        if (!file) return;
        await analyze(file);
        navigate('/dashboard');
    }, [file, analyze, navigate]);

    // Determine if user can proceed: require all mandatory columns to be mapped
    const hasRequiredCols = mappingPreview ? (mappingPreview.warnings?.length === 0) : true;

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
            <ParticleCanvas />
            <div className="landing-gradient" />

            <motion.div
                className="relative z-10 text-center max-w-2xl mx-auto px-6"
                style={{ width: '100%' }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
            >
                {/* Logo */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                >
                    <h1 style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: '3.2rem', letterSpacing: '0.15em', lineHeight: 1 }}>
                        <span style={{ color: 'var(--color-accent)' }}>MONEY</span>
                        <span style={{ color: 'var(--color-text-primary)' }}>MAL</span>
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '12px', letterSpacing: '0.04em' }}>
                        AI-Powered Graph Intelligence for Financial Crime Detection
                    </p>
                </motion.div>

                {/* Upload Section */}
                <motion.div
                    className="mt-12"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                >
                    <div
                        className={`upload-zone ${dragOver ? 'active' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                        onClick={() => document.getElementById('csv-upload').click()}
                    >
                        <input
                            id="csv-upload"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => handleFile(e.target.files[0])}
                        />
                        {file ? (
                            <div>
                                <div style={{ fontSize: '2rem', color: 'var(--color-risk-green)', marginBottom: '8px' }}>✓</div>
                                <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', fontWeight: 600, fontSize: '0.9rem' }}>
                                    {file.name}
                                </p>
                                <p style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                                    {(file.size / 1024).toFixed(1)} KB — Ready to analyze
                                </p>
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontSize: '2.5rem', opacity: 0.3, marginBottom: '12px' }}>⬆</div>
                                <p style={{ color: 'var(--color-text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>
                                    Drop transaction CSV here or click to browse
                                </p>
                                <p style={{ color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', marginTop: '10px' }}>
                                    Required: transaction_id · sender_id · receiver_id · amount · timestamp
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Column Mapping Preview */}
                    <AnimatePresence>
                        {(mappingLoading || mappingPreview || mappingError) && (
                            <MappingPreviewCard
                                mappingPreview={mappingPreview}
                                mappingLoading={mappingLoading}
                                mappingError={mappingError}
                            />
                        )}
                    </AnimatePresence>

                    {/* Progress Bar */}
                    {loading && (
                        <motion.div
                            className="mt-6"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <div className="progress-bar-container">
                                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                            </div>
                            <p style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: '10px' }}>
                                Building graph · Running detection · Scoring accounts...
                            </p>
                        </motion.div>
                    )}

                    {error && (
                        <motion.div
                            className="mt-4 glass-card p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{ borderColor: 'rgba(255, 59, 59, 0.3)' }}
                        >
                            <span style={{ color: 'var(--color-risk-red)', fontSize: '0.8rem' }}>✕ {error}</span>
                        </motion.div>
                    )}

                    {/* Column mapping verification feedback */}
                    {mappingPreview && !loading && (
                        hasRequiredCols ? (
                            <motion.div
                                className="mt-3 glass-card p-3"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ borderColor: 'rgba(34, 197, 94, 0.3)', textAlign: 'left' }}
                            >
                                <span style={{ color: 'var(--color-risk-green)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                                    ✓ All required columns mapped — ready to analyze
                                </span>
                            </motion.div>
                        ) : (
                            <motion.div
                                className="mt-3 glass-card p-4"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ borderColor: 'rgba(239, 68, 68, 0.4)', textAlign: 'left', background: 'rgba(239, 68, 68, 0.05)' }}
                            >
                                <div style={{ color: 'var(--color-risk-red)', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px' }}>
                                    ✕ Missing required columns
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                                    {mappingPreview.warnings.map((w, idx) => (
                                        <p key={idx} style={{ margin: '2px 0' }}>• {w}</p>
                                    ))}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                                    Available columns in file: {mappingPreview.available_columns ? mappingPreview.available_columns.join(', ') : 'none'}
                                </div>
                            </motion.div>
                        )
                    )}

                    <div className="flex gap-4 justify-center mt-8">
                        <motion.button
                            className="btn-glow"
                            disabled={!file || loading || mappingLoading || !hasRequiredCols}
                            onClick={handleAnalyze}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.98 }}
                            style={{ margin: 0 }}
                        >
                            {loading ? '◌ ANALYZING...' : mappingLoading ? '◌ PREVIEWING...' : '▶ LAUNCH ANALYSIS'}
                        </motion.button>
                        <motion.button
                            className="btn-secondary"
                            onClick={() => navigate('/live')}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.98 }}
                            style={{ padding: '12px 24px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            ⚡ LIVE SIMULATOR
                        </motion.button>
                    </div>
                </motion.div>

                {/* Bottom info */}
                <motion.div
                    className="mt-16 flex justify-center gap-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                >
                    {['Cycle Detection', 'Shell Networks', 'Smurfing', 'Structuring'].map((f) => (
                        <span key={f} style={{ color: 'var(--color-text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                            {f}
                        </span>
                    ))}
                </motion.div>
            </motion.div>
        </div>
    );
}
