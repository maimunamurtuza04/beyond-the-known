export function Skeleton({ height = 24, width = '100%', radius = 10, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
