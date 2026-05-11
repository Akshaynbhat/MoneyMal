import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CsvPreviewModal
 *
 * Props:
 *   open             – boolean
 *   onClose          – () => void
 *   onConfirm        – () => void  (triggers the actual analysis)
 *   mappingData      – { mapping_summary, mapped_canonicals, warnings, preview, preview_columns }
 *   loading          – boolean (analysis in progress)
 */
export default function CsvPreviewModal({ open, onClose, onConfirm, mappingData, loading }) {
    const overlayRef = useRef(null);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        if (open) window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!mappingData) return null;

    const { mapping_summary = {}, mapped_canonicals = [], warnings = [], preview = [], preview_columns = [] } = mappingData;

    // Separate the helpful mapping message (✓) from real warnings (⚠)
    const mappingMsgs = warnings.filter(w => w.startsWith('✓'));
    const warnMsgs    = warnings.filter(w => w.startsWith('⚠'));

    const CANONICAL_SET = new Set(['sender_id', 'receiver_id', 'amount', 'timestamp', 'transaction_id']);
    const isMapped = (col) => mapped_canonicals.includes(col) || CANONICAL_SET.has(col);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    ref={overlayRef}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(5, 8, 15, 0.85)', backdropFilter: 'blur(6px)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
                >
                    <motion.div
                        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                        style={{
                            background: 'linear-gradient(135deg, #0e1621 0%, #111c2b 100%)',
                            border: '1px solid rgba(0,245,255,0.15)',
                            borderRadius: '16px',
                            boxShadow: '0 0 60px rgba(0,245,255,0.08)',
                        }}
                        initial={{ scale: 0.92, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: 20 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                            <div>
                                <h2 style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.1em', color: 'var(--color-accent)' }}>
                                    CSV COLUMN MAPPING
                                </h2>
                                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-dim)', marginTop: '2px' }}>
                                    Review detected columns before running detection
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                style={{ color: 'var(--color-text-dim)', fontSize: '1.2rem', lineHeight: 1 }}
                                className="hover:text-white transition-colors"
                            >✕</button>
                        </div>

                        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

                            {/* Mapping summary chips */}
                            {mappingMsgs.length > 0 && (
                                <div style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '10px', padding: '14px 16px' }}>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-accent)', marginBottom: '10px', letterSpacing: '0.06em' }}>
                                        DETECTED COLUMN MAPPINGS
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(mapping_summary).map(([orig, canon]) => (
                                            <div
                                                key={orig}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    background: 'rgba(0,245,255,0.08)',
                                                    border: '1px solid rgba(0,245,255,0.2)',
                                                    borderRadius: '6px', padding: '4px 10px',
                                                    fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
                                                }}
                                            >
                                                <span style={{ color: '#94a3b8' }}>{orig}</span>
                                                <span style={{ color: 'var(--color-text-dim)' }}>→</span>
                                                <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{canon}</span>
                                            </div>
                                        ))}
                                        {Object.keys(mapping_summary).length === 0 && (
                                            <span style={{ color: '#22c55e', fontSize: '0.75rem' }}>
                                                ✓ All required columns matched exactly — no remapping needed.
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Warnings */}
                            {warnMsgs.length > 0 && (
                                <div style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '10px', padding: '14px 16px' }}>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#eab308', marginBottom: '8px', letterSpacing: '0.06em' }}>
                                        ⚠ WARNINGS
                                    </p>
                                    <ul className="space-y-1">
                                        {warnMsgs.map((w, i) => (
                                            <li key={i} style={{ fontSize: '0.75rem', color: '#fcd34d' }}>{w}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Data preview table */}
                            {preview.length > 0 && (
                                <div>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '10px', letterSpacing: '0.06em' }}>
                                        DATA PREVIEW — FIRST {preview.length} ROWS
                                        <span style={{ color: 'var(--color-text-dim)', marginLeft: '8px', fontWeight: 400 }}>
                                            (highlighted columns = mapped/canonical)
                                        </span>
                                    </p>
                                    <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                    {preview_columns.map(col => (
                                                        <th
                                                            key={col}
                                                            style={{
                                                                padding: '8px 12px',
                                                                textAlign: 'left',
                                                                fontWeight: 700,
                                                                whiteSpace: 'nowrap',
                                                                color: isMapped(col) ? 'var(--color-accent)' : 'var(--color-text-dim)',
                                                                borderBottom: isMapped(col)
                                                                    ? '2px solid rgba(0,245,255,0.4)'
                                                                    : '1px solid rgba(255,255,255,0.06)',
                                                                background: isMapped(col) ? 'rgba(0,245,255,0.05)' : 'transparent',
                                                            }}
                                                        >
                                                            {col}
                                                            {isMapped(col) && (
                                                                <span style={{ marginLeft: '5px', fontSize: '0.6rem', color: 'rgba(0,245,255,0.6)' }}>✓</span>
                                                            )}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.map((row, ri) => (
                                                    <tr
                                                        key={ri}
                                                        style={{ background: ri % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}
                                                    >
                                                        {preview_columns.map(col => (
                                                            <td
                                                                key={col}
                                                                style={{
                                                                    padding: '7px 12px',
                                                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                                    color: isMapped(col) ? 'var(--color-text-primary)' : 'var(--color-text-dim)',
                                                                    background: isMapped(col) ? 'rgba(0,245,255,0.02)' : 'transparent',
                                                                    maxWidth: '180px',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                                title={String(row[col] ?? '')}
                                                            >
                                                                {row[col] !== null && row[col] !== undefined
                                                                    ? String(row[col]).substring(0, 40)
                                                                    : <span style={{ color: '#475569' }}>null</span>
                                                                }
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer actions */}
                        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
                            <button
                                onClick={onClose}
                                disabled={loading}
                                style={{
                                    padding: '8px 20px', fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                                    color: 'var(--color-text-secondary)', background: 'transparent',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
                                onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                            >
                                ← Change File
                            </button>

                            <button
                                onClick={onConfirm}
                                disabled={loading}
                                style={{
                                    padding: '10px 28px', fontSize: '0.82rem', fontWeight: 700,
                                    fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                                    background: loading ? 'rgba(0,245,255,0.15)' : 'linear-gradient(135deg, #00f5ff22, #0ea5e9aa)',
                                    border: '1px solid rgba(0,245,255,0.4)',
                                    borderRadius: '10px', color: '#00f5ff',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    boxShadow: loading ? 'none' : '0 0 20px rgba(0,245,255,0.15)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {loading ? '◌ ANALYZING...' : '▶ CONFIRM & RUN DETECTION'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
