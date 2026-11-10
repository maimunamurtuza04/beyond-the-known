export function IntensityLegend({ classes = [], compact = false }) {
  if (!classes.length) return null;
  return (
    <div className={`intensity-legend ${compact ? 'compact' : ''}`}>
      <div className="legend-head">
        <span>Fire intensity</span>
        <span className="mono">FRP · MW</span>
      </div>
      <div className="legend-bar" />
      {!compact && (
        <div className="legend-ticks">
          {classes.map((item) => (
            <span key={item.id} className="legend-tick">
              <span className="legend-swatch" style={{ background: item.color }} />
              <span className="legend-name">{item.label}</span>
              <span className="legend-value mono">
                {item.min == null ? '' : item.max == null ? `${item.min}+` : `${item.min}–${item.max}`}
              </span>
            </span>
          ))}
        </div>
      )}
      {compact && (
        <div className="legend-ends">
          <span>Low</span>
          <span>Extreme</span>
        </div>
      )}
    </div>
  );
}
