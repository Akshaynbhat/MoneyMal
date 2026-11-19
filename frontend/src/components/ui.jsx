/* Shared presentational primitives for the MoneyMal interface.
   Pure UI — no data fetching, no business logic. */

const PATHS = {
    overview: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    intake: <><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" /></>,
    network: <><circle cx="5" cy="6" r="2.2" /><circle cx="19" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7.1 6.6h9.8M6.2 7.9l4.6 8.3M17.8 7.9l-4.6 8.3" /></>,
    ledger: <><path d="M4 6h16M4 12h16M4 18h16" /><path d="M9 3v18" /></>,
    risk: <><path d="M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3Z" /><path d="M12 8v4.5M12 15.8v.2" /></>,
    live: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
    x: <><path d="M6 6l12 12M18 6 6 18" /></>,
    check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
    alert: <><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.2M12 16.9v.2" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.2" /></>,
    file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></>,
    download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
    arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    arrowLeft: <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
    chevronRight: <><path d="m9 6 6 6-6 6" /></>,
    chevronLeft: <><path d="m15 6-6 6 6 6" /></>,
    chevronDown: <><path d="m6 9 6 6 6-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <><path d="M5 12h14" /></>,
    fit: <><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.7-4.3L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M4 13a8 8 0 0 0 14.7 4.3L20 15.5" /><path d="M20 20v-4.5h-4.5" /></>,
    play: <><path d="M7 5v14l11-7L7 5Z" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    flow: <><path d="M4 12h12" /><path d="m12 7 5 5-5 5" /><circle cx="20" cy="12" r="1" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
};

export function Icon({ name, size = 16, stroke = 1.5, style, className }) {
    return (
        <svg
            width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" style={style} className={className}
        >
            {PATHS[name]}
        </svg>
    );
}

/* Risk tiers — thresholds are passed in by each caller so every screen keeps
   the exact cut-offs it used before the redesign. */
export function tierOf(score, high = 70, mid = 30, strictHigh = true) {
    const s = Number(score) || 0;
    if (strictHigh ? s > high : s >= high) return 'crit';
    if (strictHigh ? s > mid : s >= mid) return 'warn';
    return 'low';
}

export function Score({ value, tier, width = 56, decimals = 1 }) {
    const v = Number(value) || 0;
    const t = tier || tierOf(v);
    return (
        <span className={`score ${t}`}>
            <span style={{ minWidth: 34, textAlign: 'right' }}>{v.toFixed(decimals)}</span>
            <span className="score-bar" style={{ width }}><i style={{ width: `${Math.min(100, Math.max(0, v))}%` }} /></span>
        </span>
    );
}

const VERDICT = { BLOCK: 'crit', REVIEW: 'warn', APPROVE: 'pos' };
export function Verdict({ value }) {
    const v = value || 'APPROVE';
    return <span className={`tag tag-dot ${VERDICT[v] || 'muted'}`}>{v}</span>;
}

export function Role({ value }) {
    return <span className="tag muted">{value || 'LEAF'}</span>;
}

export function EmptyState({ icon = 'info', title, children, action }) {
    return (
        <div className="empty">
            <div className="empty-mark"><Icon name={icon} size={16} /></div>
            {title && <div className="empty-title">{title}</div>}
            {children && <div className="empty-text">{children}</div>}
            {action && <div style={{ marginTop: 8 }}>{action}</div>}
        </div>
    );
}

export function SkeletonRows({ rows = 8, cols = 6 }) {
    return Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
            {Array.from({ length: cols }).map((__, c) => (
                <td key={c}>
                    <div className="skeleton" style={{ height: 10, width: `${45 + ((r * 7 + c * 13) % 45)}%` }} />
                </td>
            ))}
        </tr>
    ));
}

export function SortHead({ col, label, sortBy, sortDir, onSort, align }) {
    const on = sortBy === col;
    return (
        <th
            className={`sortable ${on ? 'sorted' : ''} ${align === 'right' ? 'r' : ''}`}
            onClick={() => onSort(col)}
            aria-sort={on ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
            {label}
            <span className="sort-ind">{on ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </th>
    );
}

export function PageHead({ eyebrow, title, sub, children }) {
    return (
        <header className="page-head">
            <div style={{ minWidth: 0 }}>
                {eyebrow && <div className="eyebrow">{eyebrow}</div>}
                <h1 className="page-title">{title}</h1>
                {sub && <p className="page-sub">{sub}</p>}
            </div>
            {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
        </header>
    );
}
