/* Linear risk scale: a 0–100 track with tier bands and a marker.
   Thresholds (30 / 50 / 70) match the labels the gauge always used. */
export default function RiskGauge({ score = 0 }) {
    const v = Math.min(100, Math.max(0, Number(score) || 0));
    const label = v > 70 ? 'Critical' : v > 50 ? 'High' : v > 30 ? 'Moderate' : 'Low';
    const tone = v > 70 ? 'var(--crit)' : v > 30 ? 'var(--warn)' : 'var(--pos)';

    return (
        <div>
            <div className="flex items-baseline justify-between">
                <span className="num" style={{ fontSize: '1.5rem', letterSpacing: '-0.03em' }}>{v.toFixed(1)}</span>
                <span className="tag" style={{ color: tone, borderColor: 'var(--line-2)' }}>{label}</span>
            </div>
            <div style={{ position: 'relative', marginTop: 12, height: 18 }}>
                <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 4, display: 'flex', gap: 2 }}>
                    <span style={{ width: '30%', background: 'rgba(111,171,136,0.35)', borderRadius: '2px 0 0 2px' }} />
                    <span style={{ width: '40%', background: 'rgba(211,164,92,0.35)' }} />
                    <span style={{ width: '30%', background: 'rgba(207,113,102,0.4)', borderRadius: '0 2px 2px 0' }} />
                </div>
                <div style={{ position: 'absolute', top: 0, left: `calc(${v}% - 1px)`, width: 2, height: 18, background: 'var(--ink)', borderRadius: 1, transition: 'left 0.6s var(--ease)' }} />
            </div>
            <div className="flex justify-between mono" style={{ fontSize: '0.64rem', color: 'var(--ink-4)', marginTop: 4 }}>
                <span>0</span><span>30</span><span>70</span><span>100</span>
            </div>
        </div>
    );
}
