import { Icon } from './Icons.jsx';
import { Sparkline } from './Sparkline.jsx';
import { fmtSignedPct } from '../lib/format.js';

export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaLabel = 'vs prev.',
  hint,
  spark,
  sparkColor = '#F97316',
  icon,
}) {
  const hasDelta = delta != null && Number.isFinite(delta);
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon"><Icon name={icon} size={15} /></span>}
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-foot">
        {hasDelta ? (
          <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
            <Icon name={delta >= 0 ? 'arrowUp' : 'arrowDown'} size={12} strokeWidth={2} />
            {fmtSignedPct(delta)}
            <span className="delta-label">{deltaLabel}</span>
          </span>
        ) : (
          <span className="stat-hint">{hint}</span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="stat-spark">
          <Sparkline values={spark} color={sparkColor} height={30} />
        </div>
      )}
    </article>
  );
}
