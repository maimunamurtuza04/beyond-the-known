import { heatColor, maxOf } from '../lib/colors.js';
import { fmtCompact, fmtDate, fmtInt, MONTH_SHORT } from '../lib/format.js';

const DAY_MS = 86400000;
const MONTH_NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1);

function mondayIndex(date) {
  return (date.getUTCDay() + 6) % 7;
}

function daysInYear(year) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
}

export function DayStrip({ year, days }) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const total = daysInYear(year);
  const startWeekday = mondayIndex(new Date(Date.UTC(year, 0, 1)));
  const weeks = Math.ceil((startWeekday + total) / 7);
  const values = days.map((day) => day.detections);
  const max = maxOf(values) || 1;

  const columns = Array.from({ length: weeks }, (_, week) => {
    const cells = Array.from({ length: 7 }, (_, weekday) => {
      const offset = week * 7 + weekday - startWeekday;
      if (offset < 0 || offset >= total) return null;
      const date = new Date(Date.UTC(year, 0, offset + 1));
      const iso = date.toISOString().slice(0, 10);
      return { iso, entry: byDate.get(iso) };
    });
    return cells;
  });

  const monthLabels = MONTH_SHORT.map((label, month) => {
    const start = Math.floor((startWeekday + Math.floor((Date.UTC(year, month, 1) - Date.UTC(year, 0, 1)) / DAY_MS)) / 7);
    const next = month === 11
      ? weeks
      : Math.floor((startWeekday + Math.floor((Date.UTC(year, month + 1, 1) - Date.UTC(year, 0, 1)) / DAY_MS)) / 7);
    return { label, start, end: Math.max(start + 1, next) };
  });

  return (
    <div className="day-strip">
      <div className="strip-weekdays" aria-hidden="true">
        <span style={{ gridRow: 2 }}>Mon</span>
        <span style={{ gridRow: 4 }}>Wed</span>
        <span style={{ gridRow: 6 }}>Fri</span>
      </div>
      <div className="strip-body">
        <div className="strip-months" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {monthLabels.map(({ label, start, end }) => (
            <span key={label} style={{ gridColumn: `${start + 1} / ${end + 1}` }}>{label}</span>
          ))}
        </div>
        <div className="strip-grid" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {columns.map((cells, week) => (
            <div className="strip-week" key={week}>
              {cells.map((cell, weekday) => {
                if (!cell) return <span className="strip-cell empty" key={`empty-${week}-${weekday}`} />;
                const value = cell.entry?.detections ?? 0;
                const anomaly = Boolean(cell.entry?.anomaly);
                return (
                  <span
                    key={cell.iso}
                    className={`strip-cell ${anomaly ? 'flagged' : ''}`}
                    style={{ background: heatColor(value, max) }}
                    title={`${fmtDate(cell.iso)} · ${fmtInt(value)} detections${
                      cell.entry?.frp ? ` · ${cell.entry.frp.toFixed(1)} MW` : ''
                    }${anomaly ? ' · flagged day' : ''}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="strip-legend">
          <span>Less</span>
          {[0.15, 0.35, 0.55, 0.75, 1].map((t) => (
            <i key={t} style={{ background: heatColor(max * t, max) }} />
          ))}
          <span>More</span>
          <span className="strip-anomaly-key"><i />flagged</span>
        </div>
      </div>
    </div>
  );
}

export function YearMonthHeatmap({ years, cells, selectedYear, onSelectYear }) {
  const map = new Map(cells.map((cell) => [`${cell.year}-${cell.month}`, cell]));
  const max = maxOf(cells.map((cell) => cell.detections)) || 1;

  return (
    <div className="ym-heat">
      <div className="ym-grid">
        <div className="ym-corner" />
        {MONTH_SHORT.map((month) => (
          <div className="ym-month" key={month}>{month}</div>
        ))}
        {years.map((year) => (
          <div className="ym-row" key={year} style={{ display: 'contents' }}>
            <button
              type="button"
              className={`ym-year ${selectedYear === year ? 'selected' : ''}`}
              onClick={() => onSelectYear(year)}
            >
              {year}
            </button>
            {MONTH_NUMBERS.map((month) => {
              const cell = map.get(`${year}-${month}`);
              const value = cell?.detections ?? 0;
              return (
                <button
                  type="button"
                  key={month}
                  className={`ym-cell ${selectedYear === year ? 'selected-row' : ''}`}
                  style={{ background: heatColor(value, max) }}
                  onClick={() => onSelectYear(year)}
                  title={`${MONTH_SHORT[month - 1]} ${year} · ${fmtInt(value)} detections · ${
                    cell ? cell.frp.toFixed(1) : '0'
                  } MW`}
                  aria-label={`${MONTH_SHORT[month - 1]} ${year}: ${fmtInt(value)} detections`}
                >
                  <span>{value > 0 ? fmtCompact(value) : ''}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthDayHeatmap({ cells, max: providedMax }) {
  const map = new Map(cells.map((cell) => [`${cell.month}-${cell.day}`, cell]));
  const max = providedMax || maxOf(cells.map((cell) => cell.detections)) || 1;
  const daysPerMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    <div className="md-heat">
      <div className="md-grid">
        <div className="md-corner" />
        {Array.from({ length: 31 }, (_, index) => (
          <div className="md-day-label" key={index}>{index + 1}</div>
        ))}
        {daysPerMonth.map((maxDay, index) => {
          const month = index + 1;
          return (
            <div className="md-row" key={month} style={{ display: 'contents' }}>
              <div className="md-month-label">{MONTH_SHORT[index]}</div>
              {Array.from({ length: 31 }, (_, dayIndex) => {
                const day = dayIndex + 1;
                if (day > maxDay) return <span className="md-cell invalid" key={`${month}-${day}`} />;
                const cell = map.get(`${month}-${day}`);
                const value = cell?.detections ?? 0;
                return (
                  <span
                    key={`${month}-${day}`}
                    className="md-cell"
                    style={{ background: heatColor(value, max) }}
                    title={`${MONTH_SHORT[index]} ${day} · ${
                      value ? `${fmtInt(value)} detections/day` : 'no data'
                    }`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="heat-scale">
        <span>0</span>
        <div className="heat-scale-bar" />
        <span>{fmtCompact(max)} / day</span>
      </div>
    </div>
  );
}

export function HeatLegend({ max, unit = 'detections' }) {
  return (
    <div className="heat-scale">
      <span>0</span>
      <div className="heat-scale-bar" />
      <span>{fmtCompact(max)} {unit}</span>
    </div>
  );
}
