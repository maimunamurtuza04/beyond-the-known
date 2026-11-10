export const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'Overview',
    subtitle: 'The whole record at a glance',
    icon: 'grid',
  },
  {
    id: 'map',
    label: 'Fire map',
    title: 'Fire map',
    subtitle: 'Where it burned, month by month',
    icon: 'map',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    title: 'Fire calendar',
    subtitle: 'Months across years, days across months',
    icon: 'calendar',
  },
  {
    id: 'trends',
    label: 'Trends',
    title: 'Trends',
    subtitle: 'Long arcs and seasonal cycles',
    icon: 'trend',
  },
  {
    id: 'anomalies',
    label: 'Anomalies',
    title: 'Out of the ordinary',
    subtitle: 'Days that broke their own baseline',
    icon: 'alert',
    accent: true,
  },
  {
    id: 'calibration',
    label: 'Calibration',
    title: 'Calibration & confidence',
    subtitle: 'Two sensors, one honest scale',
    icon: 'target',
  },
  {
    id: 'methods',
    label: 'Methods',
    title: 'Methods & data',
    subtitle: 'How this record is made',
    icon: 'book',
  },
];

export const NAV_BY_ID = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item]));
