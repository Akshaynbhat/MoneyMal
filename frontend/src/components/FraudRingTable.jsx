import { EmptyState, Score } from './ui';

/* Register of detected rings. Tiers: > 80 critical, > 50 warning (unchanged). */
export default function FraudRingTable({ rings, onSelect, maxHeight = 380 }) {
    if (!rings || rings.length === 0) {
        return <EmptyState icon="target" title="No fraud rings detected">The engine found no coordinated groups in this dataset.</EmptyState>;
    }

    return (
        <div className="table-wrap" style={{ maxHeight }}>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Ring</th>
                        <th>Pattern</th>
                        <th className="r">Members</th>
                        <th>Risk score</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {rings.map((ring) => {
                        const t = ring.risk_score > 80 ? 'crit' : ring.risk_score > 50 ? 'warn' : 'low';
                        return (
                            <tr key={ring.ring_id} className={onSelect ? 'clickable' : ''} onClick={onSelect ? () => onSelect(ring) : undefined}>
                                <td className="id">{ring.ring_id}</td>
                                <td><span className="pattern-chip">{ring.pattern_type}</span></td>
                                <td className="r num">{ring.member_accounts.length}</td>
                                <td><Score value={ring.risk_score} tier={t} /></td>
                                <td>
                                    <span className={`tag tag-dot ${t === 'crit' ? 'crit' : t === 'warn' ? 'warn' : 'pos'}`}>
                                        {t === 'crit' ? 'Critical' : t === 'warn' ? 'Warning' : 'Low'}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
