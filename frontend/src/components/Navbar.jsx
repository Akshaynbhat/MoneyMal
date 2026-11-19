import { useEffect, useState } from 'react';
import { useLocation, Link, NavLink } from 'react-router-dom';
import { useAppContext } from '../App';
import { checkHealth } from '../services/api';
import { Icon } from './ui';
import { formatBytes, formatNum, exportAnalysisJSON } from '../lib/format';

const NAV = [
    {
        group: 'Investigation',
        items: [
            { to: '/dashboard', label: 'Overview', icon: 'overview', needsResult: true },
            { to: '/graph', label: 'Transaction network', icon: 'network', needsResult: true },
            { to: '/transactions', label: 'Ledger', icon: 'ledger', needsResult: true, count: (r) => r?.suspicious_accounts?.length },
            { to: '/risk', label: 'Risk & findings', icon: 'risk', needsResult: true, count: (r) => r?.fraud_rings?.length },
        ],
    },
    {
        group: 'Workspace',
        items: [
            { to: '/intake', label: 'New analysis', icon: 'intake' },
            { to: '/live', label: 'Live monitor', icon: 'live' },
        ],
    },
];

export const PAGE_TITLES = {
    '/': 'New analysis',
    '/intake': 'New analysis',
    '/dashboard': 'Overview',
    '/graph': 'Transaction network',
    '/transactions': 'Ledger',
    '/risk': 'Risk & findings',
    '/live': 'Live monitor',
};

function useEngineHealth() {
    const [health, setHealth] = useState({ state: 'pending', engine: null });
    useEffect(() => {
        let alive = true;
        const ping = () =>
            checkHealth()
                .then((d) => alive && setHealth({ state: d?.status === 'ok' ? 'ok' : 'err', engine: d?.engine || null }))
                .catch(() => alive && setHealth({ state: 'err', engine: null }));
        ping();
        const t = setInterval(ping, 60000);
        return () => { alive = false; clearInterval(t); };
    }, []);
    return health;
}

export function Sidebar({ open, onClose }) {
    const { result } = useAppContext();
    const health = useEngineHealth();
    const { pathname } = useLocation();

    useEffect(() => { onClose?.(); }, [pathname]); // close the mobile drawer after navigating

    return (
        <>
            {open && <div className="sidebar-scrim" onClick={onClose} />}
            <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Primary">
                <Link to={result ? '/dashboard' : '/'} className="wordmark">
                    <span className="wordmark-glyph">M</span>
                    <span className="wordmark-name">MoneyMal</span>
                    <span className="wordmark-ver">v6</span>
                </Link>

                <nav>
                    {NAV.map((g) => (
                        <div key={g.group}>
                            <div className="nav-group-label">{g.group}</div>
                            {g.items.map((item) => {
                                const disabled = item.needsResult && !result;
                                const count = item.count ? item.count(result) : null;
                                const isActive =
                                    pathname === item.to ||
                                    (item.to === '/intake' && pathname === '/' && !result) ||
                                    (item.to === '/dashboard' && pathname === '/' && !!result);
                                return (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        className={`nav-item ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                                        aria-disabled={disabled || undefined}
                                        tabIndex={disabled ? -1 : undefined}
                                        title={disabled ? 'Run an analysis to unlock' : undefined}
                                    >
                                        <Icon name={item.icon} size={16} />
                                        <span>{item.label}</span>
                                        {count != null && !disabled && <span className="nav-count">{formatNum(count)}</span>}
                                    </NavLink>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-foot">
                    <div className="flex items-center gap-2">
                        <span className={`status-dot ${health.state === 'ok' ? 'ok' : health.state === 'err' ? 'err' : ''}`} />
                        <span style={{ color: 'var(--ink-2)' }}>
                            {health.state === 'ok' ? 'Engine online' : health.state === 'err' ? 'Engine unreachable' : 'Checking engine…'}
                        </span>
                    </div>
                    {health.engine && <div className="mono" style={{ fontSize: '0.66rem', marginTop: 4, color: 'var(--ink-4)' }}>{health.engine}</div>}
                </div>
            </aside>
        </>
    );
}

export function Topbar({ onMenu }) {
    const { pathname } = useLocation();
    const { result, file, loading } = useAppContext();
    const title = PAGE_TITLES[pathname] === 'New analysis' && pathname === '/' && result ? 'Overview' : (PAGE_TITLES[pathname] || '');
    const s = result?.summary;

    return (
        <header className="topbar">
            <button className="btn btn-ghost btn-icon menu-btn" onClick={onMenu} aria-label="Open navigation">
                <Icon name="menu" size={18} />
            </button>
            <div className="crumbs">
                <span className="hide-sm-crumb">Investigation</span>
                <span className="sep">/</span>
                <strong>{title}</strong>
            </div>

            <div className="topbar-ctx">
                {loading && (
                    <span className="ctx-item"><span className="spinner" style={{ width: 12, height: 12 }} /> Analysis running</span>
                )}
                {file && (
                    <span className="ctx-item hide-sm" title={file.name}>
                        <Icon name="file" size={14} />
                        <span className="mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                        <span className="hide-md">{formatBytes(file.size)}</span>
                    </span>
                )}
                {s && (
                    <>
                        <span className="ctx-divider hide-md" />
                        <span className="ctx-item hide-md"><span className="mono">{formatNum(s.total_accounts_analyzed)}</span> accounts</span>
                        <span className="ctx-item hide-md"><span className="mono">{s.processing_time_seconds?.toFixed(2)}s</span> run time</span>
                        <button className="btn btn-sm" onClick={() => exportAnalysisJSON(result)} title="Download analysis_results.json">
                            <Icon name="download" size={14} /> <span className="hide-sm">Export JSON</span>
                        </button>
                    </>
                )}
            </div>
        </header>
    );
}

export default Sidebar;
