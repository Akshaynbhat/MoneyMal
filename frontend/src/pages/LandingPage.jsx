import { useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../App';
import { previewMapping } from '../services/api';
import { Icon, PageHead } from '../components/ui';
import { formatBytes, formatNum } from '../lib/format';

const REQUIRED = ['transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp'];
const CHECKS = [
    ['Cycle detection', 'Circular routing of funds across 3–5 accounts'],
    ['Shell networks', 'Pass-through intermediaries with minimal retention'],
    ['Smurfing', 'Many small deposits aggregated, then moved'],
    ['Structuring', 'Activity shaped to stay under account-type limits'],
];

/* ── Column mapping preview ── */
function matchMeta(matchType, required = true) {
    if (!matchType) return required ? { label: 'not found', cls: 'crit', icon: 'x' } : { label: 'optional · absent', cls: 'muted', icon: 'minus' };
    if (matchType === 'exact') return { label: 'exact', cls: 'pos', icon: 'check' };
    if (matchType.startsWith('alias')) return { label: matchType, cls: 'sage', icon: 'arrowLeft' };
    if (matchType.startsWith('fuzzy')) return { label: matchType, cls: 'warn', icon: 'info' };
    return { label: matchType, cls: 'muted', icon: 'info' };
}

function MappingPreview({ mappingPreview, mappingLoading, mappingError }) {
    if (mappingLoading) {
        return (
            <div className="panel">
                <div className="panel-head"><span className="panel-title">Column mapping</span><span className="spinner" /></div>
                <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
                    {REQUIRED.map((c) => <div key={c} className="skeleton" style={{ height: 12, width: `${50 + c.length * 2}%` }} />)}
                </div>
            </div>
        );
    }

    if (mappingError) {
        return (
            <div className="notice crit">
                <Icon name="alert" size={15} />
                <div><strong>Column preview failed.</strong> {mappingError}</div>
            </div>
        );
    }

    if (!mappingPreview) return null;
    const { mapping, warnings = [], preview_rows, total_rows, total_columns } = mappingPreview;

    return (
        <motion.div className="panel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <div className="panel-head">
                <span className="panel-title">Column mapping</span>
                <span className="panel-meta mono">{formatNum(total_rows)} rows · {total_columns} columns</span>
            </div>

            <table className="data-table compact">
                <thead>
                    <tr><th>Engine field</th><th>Source column</th><th>Match</th></tr>
                </thead>
                <tbody>
                    {Object.entries(mapping).map(([canonical, info]) => {
                        const m = matchMeta(info?.match_type, REQUIRED.includes(canonical));
                        return (
                            <tr key={canonical}>
                                <td className="id">{canonical}</td>
                                <td className="mono" style={{ fontSize: '0.78rem', color: info ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                                    {info ? info.original_column : '—'}
                                </td>
                                <td><span className={`tag ${m.cls}`}><Icon name={m.icon} size={11} stroke={2} />{m.label}</span></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {warnings.length > 0 && (
                <div style={{ padding: '0 18px 16px' }}>
                    <div className="notice warn">
                        <Icon name="alert" size={15} />
                        <div style={{ display: 'grid', gap: 3 }}>
                            {warnings.map((w, i) => <span key={i} className="mono" style={{ fontSize: '0.76rem' }}>{w}</span>)}
                        </div>
                    </div>
                </div>
            )}

            {preview_rows && preview_rows.length > 0 && (
                <div style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="label" style={{ padding: '14px 18px 8px' }}>First {preview_rows.length} rows, mapped</div>
                    <div className="table-wrap" style={{ maxHeight: 260 }}>
                        <table className="data-table compact">
                            <thead>
                                <tr>{Object.keys(preview_rows[0]).map((col) => <th key={col}>{col}</th>)}</tr>
                            </thead>
                            <tbody>
                                {preview_rows.map((row, i) => (
                                    <tr key={i}>
                                        {Object.values(row).map((val, j) => (
                                            <td key={j} className="mono" style={{ fontSize: '0.74rem', color: 'var(--ink-2)', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

function Step({ n, title, detail, state }) {
    return (
        <div className={`step ${state}`}>
            <div className="step-n">{state === 'done' ? <Icon name="check" size={13} stroke={2} /> : state === 'error' ? <Icon name="x" size={12} stroke={2} /> : n}</div>
            <div>
                <div className="step-t">{title}</div>
                {detail && <div className="step-d">{detail}</div>}
            </div>
        </div>
    );
}

export default function LandingPage() {
    const { file, setFile, analyze, loading, error, progress, showToast, result } = useAppContext();
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const [mappingPreview, setMappingPreview] = useState(null);
    const [mappingLoading, setMappingLoading] = useState(false);
    const [mappingError, setMappingError] = useState(null);

    const handleFile = useCallback(async (f) => {
        if (f && f.name.endsWith('.csv')) {
            setFile(f);
            showToast(`Loaded ${f.name} (${(f.size / 1024).toFixed(0)} KB)`, 'success');

            // Trigger column mapping preview
            setMappingLoading(true);
            setMappingPreview(null);
            setMappingError(null);
            try {
                const res = await previewMapping(f);
                setMappingPreview(res);
            } catch (err) {
                setMappingError(err?.response?.data?.detail || err.message || 'Preview failed');
            } finally {
                setMappingLoading(false);
            }
        } else if (f) {
            showToast('Please upload a CSV file', 'error');
        }
    }, [setFile, showToast]);

    const handleAnalyze = useCallback(async () => {
        if (!file) return;
        const ok = await analyze(file);
        if (ok) {
            showToast('Analysis complete', 'success');
            navigate('/dashboard');
        }
    }, [file, analyze, navigate, showToast]);

    // Require all mandatory columns to be mapped
    const hasRequiredCols = mappingPreview ? (mappingPreview.warnings?.length === 0) : true;
    const canRun = file && !loading && !mappingLoading && hasRequiredCols;

    const validateState = !file ? '' : mappingLoading ? 'current' : (mappingError || !hasRequiredCols) ? 'error' : mappingPreview ? 'done' : '';
    const runState = loading ? 'current' : error ? 'error' : (validateState === 'done' ? 'current' : '');

    const phase = progress < 20 ? 'Uploading dataset' : 'Building graph · running detection · scoring accounts';

    return (
        <div className="page">
            <PageHead
                eyebrow="Intake"
                title="Open an investigation"
                sub="Load a transaction ledger. MoneyMal maps its columns, builds the counterparty graph, and scores every account for mule behaviour."
            >
                <Link to="/live" className="btn"><Icon name="live" size={14} /> Live monitor</Link>
            </PageHead>

            {result && !loading && (
                <div className="notice" style={{ marginBottom: 20 }}>
                    <Icon name="info" size={15} />
                    <div style={{ flex: 1 }}>
                        <strong>An investigation is open</strong> — {formatNum(result.summary?.total_accounts_analyzed)} accounts, {formatNum(result.summary?.suspicious_accounts_flagged)} flagged.
                        Running a new analysis replaces it.
                    </div>
                    <Link to="/dashboard" className="btn btn-sm">Return to overview</Link>
                </div>
            )}

            <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    {/* Main column */}
                    <div className="grid gap-4 content-start">
                        <div
                            className={`dropzone ${dragOver ? 'active' : ''}`}
                            style={file ? { padding: '22px 24px', flexDirection: 'row', gap: 14 } : undefined}
                            role="button"
                            tabIndex={0}
                            aria-label="Upload transaction CSV"
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                            onClick={() => inputRef.current?.click()}
                        >
                            <input
                                ref={inputRef}
                                id="csv-upload"
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }}
                            />
                            <div className="dropzone-ico"><Icon name="intake" size={18} /></div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                                {file ? 'Replace dataset' : 'Drop a transaction CSV, or browse'}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--ink-3)', display: file ? 'none' : 'block' }}>
                                CSV only · columns are matched automatically, including common aliases
                            </div>
                        </div>

                        {file && (
                            <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                                <div className="dropzone-ico" style={{ width: 36, height: 36 }}><Icon name="file" size={16} /></div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div className="mono" style={{ fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--ink-3)', marginTop: 2 }}>
                                        {formatBytes(file.size)}
                                        {mappingPreview && <> · <span className="mono">{formatNum(mappingPreview.total_rows)}</span> rows</>}
                                    </div>
                                </div>
                                {mappingLoading ? <span className="tag muted">Validating…</span>
                                    : mappingPreview && hasRequiredCols ? <span className="tag pos tag-dot">Valid</span>
                                    : (mappingError || !hasRequiredCols) ? <span className="tag crit tag-dot">Needs attention</span> : null}
                            </div>
                        )}

                        <AnimatePresence>
                            {(mappingLoading || mappingPreview || mappingError) && (
                                <MappingPreview mappingPreview={mappingPreview} mappingLoading={mappingLoading} mappingError={mappingError} />
                            )}
                        </AnimatePresence>

                        {mappingPreview && !loading && !hasRequiredCols && (
                            <div className="notice crit">
                                <Icon name="alert" size={15} />
                                <div>
                                    <strong>Missing required columns.</strong> The analysis cannot run until every required field is mapped.
                                    <div className="mono" style={{ fontSize: '0.74rem', marginTop: 6, color: 'var(--ink-3)' }}>
                                        Columns in file: {mappingPreview.available_columns ? mappingPreview.available_columns.join(', ') : 'none'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="notice crit" role="alert">
                                <Icon name="alert" size={15} />
                                <div><strong>Analysis failed.</strong> {error}</div>
                            </div>
                        )}

                        {/* Run */}
                        <div className="panel" style={{ padding: '16px 18px' }}>
                            {loading ? (
                                <div>
                                    <div className="flex items-center justify-between" style={{ marginBottom: 10, fontSize: '0.82rem' }}>
                                        <span style={{ color: 'var(--ink-2)' }}>{phase}</span>
                                        <span className="mono" style={{ color: 'var(--ink-3)' }}>{progress}%</span>
                                    </div>
                                    <div className="progress"><i style={{ width: `${Math.max(progress, 4)}%` }} /></div>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--ink-4)', marginTop: 10 }}>
                                        Large ledgers can take several minutes. You can leave this page open.
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div style={{ fontSize: '0.82rem', color: 'var(--ink-2)' }}>
                                        {!file ? 'Select a dataset to begin.'
                                            : mappingLoading ? 'Validating column structure…'
                                            : !hasRequiredCols ? 'Resolve the missing columns to continue.'
                                            : mappingError ? 'Column preview unavailable — the analysis can still be submitted.'
                                            : 'Dataset validated. Ready to run detection.'}
                                    </div>
                                    <button className="btn btn-solid btn-lg" disabled={!canRun} onClick={handleAnalyze}>
                                        Run analysis <Icon name="arrowRight" size={15} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Side column */}
                    <aside className="grid gap-4 content-start">
                        <div className="panel">
                            <div className="panel-head"><span className="panel-title">Workflow</span></div>
                            <div className="panel-body">
                                <div className="steps">
                                    <Step n={1} title="Select dataset" detail={file ? file.name : 'CSV transaction ledger'} state={file ? 'done' : 'current'} />
                                    <Step n={2} title="Validate columns" detail="Map fields to the engine schema" state={validateState} />
                                    <Step n={3} title="Run analysis" detail="Graph build, detection, scoring" state={runState} />
                                    <Step n={4} title="Review findings" detail="Overview, network, ledger" state="" />
                                </div>
                            </div>
                        </div>

                        <div className="panel">
                            <div className="panel-head"><span className="panel-title">Required fields</span></div>
                            <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {REQUIRED.map((c) => <span key={c} className="pattern-chip">{c}</span>)}
                            </div>
                        </div>

                        <div className="panel">
                            <div className="panel-head"><span className="panel-title">Detection coverage</span></div>
                            <div style={{ padding: '4px 18px 12px' }}>
                                {CHECKS.map(([t, d], i) => (
                                    <div key={t} style={{ padding: '10px 0', borderBottom: i < CHECKS.length - 1 ? '1px solid var(--line)' : 0 }}>
                                        <div style={{ fontSize: '0.82rem' }}>{t}</div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--ink-3)', marginTop: 2 }}>{d}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
