export function Panel({
  kicker,
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = '',
}) {
  return (
    <section className={`panel ${className}`}>
      {(kicker || title || action) && (
        <header className="panel-head">
          <div className="panel-heading">
            {kicker && <div className="kicker">{kicker}</div>}
            {title && <h3 className="panel-title">{title}</h3>}
            {subtitle && <p className="panel-subtitle">{subtitle}</p>}
          </div>
          {action && <div className="panel-action">{action}</div>}
        </header>
      )}
      <div className={`panel-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function SectionHeader({ kicker, title, description, action }) {
  return (
    <div className="section-head">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h2 className="section-title">{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}
