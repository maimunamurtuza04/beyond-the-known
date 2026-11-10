const paths = {
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  map: (
    <>
      <path d="M9 4 3.5 6.5v13L9 17l6 2.5 5.5-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  trend: (
    <>
      <path d="M4 16.5 9 11l3.5 3.2L20 6.5" />
      <path d="M15.5 6.5H20V11" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8 21 20H3L12 3.8Z" />
      <path d="M12 9.5v4.4M12 17.3v.2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v3.2M12 18v3.2M2.8 12h3.2M18 12h3.2" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.2A2.2 2.2 0 0 1 6.2 3H20v16.8H6.2A2.2 2.2 0 0 0 4 22V5.2Z" />
      <path d="M4 18.2A2.2 2.2 0 0 1 6.2 16H20M8 7h8M8 10.5h5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5a8 8 0 1 0-2.4 5.9" />
      <path d="M20 4.5v7h-7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.7v5.1M12 7.8v.2" />
    </>
  ),
  arrowUp: <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />,
  arrowDown: <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />,
  arrowRight: <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />,
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  layers: (
    <>
      <path d="m12 3.5 9 4.7-9 4.7-9-4.7 9-4.7Z" />
      <path d="m3.5 12.4 8.5 4.4 8.5-4.4M3.5 16.6l8.5 4.4 8.5-4.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.4 2" />
    </>
  ),
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  pin: (
    <>
      <path d="M12 21s6.5-5.7 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.3 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  spark: <path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9l2-6.5Z" />,
  flame: (
    <path d="M12 21c3.6 0 6.5-2.7 6.5-6.3 0-2.9-1.6-5-3.4-7-1.8-2-3.3-3.6-3-6.7-2.7 1.8-3.8 4.2-3.8 6.4 0 1.4.5 2.4 1.1 3.2-1.4-.3-2.1-1.5-2.4-2.6-1 1.4-1.5 3.1-1.5 5.2C5.5 18.3 8.4 21 12 21Z" />
  ),
  download: (
    <>
      <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  slash: <path d="M5 19 19 5" />,
};

export function Icon({ name, size = 18, strokeWidth = 1.6, className = '' }) {
  const content = paths[name] || paths.info;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {content}
    </svg>
  );
}

export function FlameMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="flame-mark" x1="8" y1="28" x2="26" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B91C1C" />
          <stop offset="0.5" stopColor="#F97316" />
          <stop offset="1" stopColor="#FACC15" />
        </linearGradient>
      </defs>
      <path
        d="M16.4 2.6c.5 5.6-2.9 7.9-5.3 11.1-2.6 3.5-4.7 6.4-4.7 10.1A9.6 9.6 0 0 0 16 33.4a9.6 9.6 0 0 0 9.6-9.6c0-4.4-2.2-8-5.2-11.4-2.8-3.1-5-5.5-4-9.8Z"
        fill="url(#flame-mark)"
        opacity="0.95"
      />
      <path
        d="M16.2 17.4c.2 2.6-1.3 3.7-2.4 5.2-1.2 1.6-2.1 2.9-2.1 4.6a4.4 4.4 0 0 0 8.8 0c0-2-1-3.7-2.4-5.3-1.3-1.5-2.3-2.6-1.9-4.5Z"
        fill="#0A0908"
        opacity="0.42"
      />
    </svg>
  );
}
