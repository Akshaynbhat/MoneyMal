import { useMemo } from 'react';

/* Arc gauge with needle (restored from the original dashboard, restyled).
   Bands: > 70 critical, > 50 high, > 30 moderate, else low. */
export default function RiskGauge({ score = 0 }) {
    const normalized = Math.min(100, Math.max(0, Number(score) || 0));
    const angle = -225 + (normalized / 100) * 270;

    const color = normalized > 70 ? '#e8675c' : normalized > 30 ? '#e6a94f' : '#5fbf8f';
    const label = useMemo(() => {
        if (normalized > 70) return 'CRITICAL';
        if (normalized > 50) return 'HIGH';
        if (normalized > 30) return 'MODERATE';
        return 'LOW';
    }, [normalized]);

    // 270° arc, radius 80, centred at (100,100)
    const arc = 'M 43.4 156.6 A 80 80 0 1 1 156.6 156.6';
    const len = 2 * Math.PI * 80 * 0.75;
    const rad = (angle * Math.PI) / 180;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg viewBox="0 0 200 175" style={{ width: 210, maxWidth: '100%' }} role="img" aria-label={`Threat level ${normalized.toFixed(0)} of 100, ${label}`}>
                <defs>
                    <linearGradient id="gaugeTrack" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#5fbf8f" stopOpacity="0.28" />
                        <stop offset="50%" stopColor="#e6a94f" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#e8675c" stopOpacity="0.32" />
                    </linearGradient>
                </defs>
                <path d={arc} fill="none" stroke="url(#gaugeTrack)" strokeWidth="10" strokeLinecap="round" />
                <path
                    d={arc} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(normalized / 100) * len} ${len}`}
                    style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 6px ${color}55)` }}
                />
                <line
                    x1="100" y1="100"
                    x2={100 + 58 * Math.cos(rad)} y2={100 + 58 * Math.sin(rad)}
                    stroke="#f3efe6" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transition: 'all 1s ease' }}
                />
                <circle cx="100" cy="100" r="5" fill="#f3efe6" />
                <text x="100" y="140" textAnchor="middle" fill={color} fontFamily="IBM Plex Mono, monospace" fontWeight="500" fontSize="28">
                    {normalized.toFixed(1)}
                </text>
            </svg>
            <span className="tag" style={{ color, borderColor: `${color}55`, background: `${color}18`, marginTop: -4 }}>{label}</span>
        </div>
    );
}
