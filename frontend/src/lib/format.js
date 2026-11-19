export const formatINR = (val) =>
    Number(val || 0).toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/* Compact INR for dense headers: ₹1.24 Cr, ₹8.50 L */
export const formatINRCompact = (val) => {
    const n = Number(val || 0);
    const abs = Math.abs(n);
    if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return formatINR(n);
};

export const formatNum = (val) => Number(val || 0).toLocaleString('en-IN');

export const formatBytes = (b) => {
    if (b == null) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

/* Display labels for engine pattern codes (union of the labels the app already used). */
export const PATTERN_LABELS = {
    F1_FAST_PASSTHROUGH: 'F1 · Fast passthrough',
    F2_DORMANT_BURST: 'F2 · Dormant burst',
    F3_MICRO_SMURFING: 'F3 · Micro-smurfing',
    F4_MACRO_VOLUME_OUTLIER: 'F4 · Macro volume outlier',
    F5_RAPID_OUTBOUND: 'F5 · Rapid outbound',
    F6_COORDINATED_GROUP: 'F6 · Coordinated group',
    F7_OUTLIER_TXN: 'F7 · Outlier transaction',
    F8_NEW_ACC_HIGH_VAL: 'F8 · New account, high value',
    F9_NEW_ACC_HIGH_VELOCITY: 'F9 · New account, high velocity',
    F10_RAPID_LAYERING: 'F10 · Rapid layering',
    F10_CROSS_BANK_LAYERING: 'F10 · Cross-bank layering',
    cycle_length_3: 'Circular loop (L3)',
    cycle_length_4: 'Circular loop (L4)',
    cycle_length_5: 'Circular loop (L5)',
    shell_account: 'Shell intermediary',
    smurfing: 'Smurfing',
    fan_in: 'Fan-in (aggregation)',
    fan_out: 'Fan-out (dispersal)',
    bipartite: 'Coordinated circular flow',
    threshold_breach: 'Limit threshold breach',
    high_velocity: 'High-velocity transfer',
    low_variance: 'Low-variance pattern',
};

export const patternLabel = (p) => PATTERN_LABELS[p] || p;

/* Export the current analysis as JSON — same payload the Data Explorer produced before. */
export function exportAnalysisJSON(result) {
    if (!result) return;
    const output = {
        suspicious_accounts: (result.suspicious_accounts || []).map((a) => ({
            account_id: a.account_id,
            verdict: a.verdict || 'APPROVE',
            suspicion_score: a.suspicion_score,
            structural_role: a.structural_role || 'LEAF',
            four_pillar_scores: a.four_pillar_scores || {},
            detected_patterns: a.detected_patterns || [],
            ring_id: a.ring_id || null,
        })),
        fraud_rings: (result.fraud_rings || []).map((r) => ({
            ring_id: r.ring_id,
            member_accounts: r.member_accounts || r.accounts || [],
            pattern_type: r.pattern_type || r.type || 'unknown',
            risk_score: r.risk_score ?? r.score ?? 0,
        })),
        summary: {
            total_accounts_analyzed: result.summary?.total_accounts_analyzed ?? 0,
            suspicious_accounts_flagged: result.summary?.suspicious_accounts_flagged ?? (result.suspicious_accounts || []).length,
            fraud_rings_detected: result.summary?.fraud_rings_detected ?? (result.fraud_rings || []).length,
            processing_time_seconds: result.summary?.processing_time_seconds ?? 0,
        },
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis_results.json';
    a.click();
    URL.revokeObjectURL(url);
}
