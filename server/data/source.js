import { config } from '../config.js';
import {
  INTENSITY_CLASSES,
  REGIONS,
  REGION_BY_ID,
  SENSORS,
  SENSOR_BY_ID,
} from '../mock/catalog.js';
import { buildDataset, DAY_MS, mulberry32 } from '../mock/generate.js';

/**
 * ─────────────────────────────────────────────────────────────
 *  DATA SOURCE · the seam between the UI and your record
 * ─────────────────────────────────────────────────────────────
 * Every API route calls one of the functions exported at the
 * bottom of this file. Right now each one reads the illustrative
 * mock dataset. To connect your cleaned data:
 *
 *   1. Load your CSV / Parquet into Postgres using
 *      server/sql/schema.sql and data/README.md.
 *   2. Copy server/data/postgres.example.js to
 *      server/data/postgres.js and implement the queries.
 *   3. Change ONE line:
 *
 *        export const source = mockSource;   ← current
 *        export const source = postgresSource;
 *
 * The response shapes are the contract. Keep them and the
 * frontend, charts and calendar keep working unchanged.
 * ─────────────────────────────────────────────────────────────
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let state = null;

function getState() {
  if (!state) {
    const data = buildDataset();
    const baseline = new Map();
    for (const record of data.days) {
      if (record.year > 2022) continue;
      const key = `${record.regionId}|${record.doy}`;
      const entry = baseline.get(key) || { total: 0, count: 0 };
      entry.total += record.detections;
      entry.count += 1;
      baseline.set(key, entry);
    }
    baseline.forEach((entry, key) => {
      baseline.set(key, entry.total / entry.count);
    });
    state = { ...data, baseline };
  }
  return state;
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function delta(current, previous) {
  if (!previous) return null;
  return round((current - previous) / previous, 4);
}

function distribute(total, fractions) {
  if (!total) return fractions.map(() => 0);
  const raw = fractions.map((f) => Math.max(0, f) * total);
  const out = raw.map(Math.floor);
  let remainder = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  let cursor = 0;
  while (remainder > 0) {
    out[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return out;
}

function normalizeScope(query = {}) {
  const data = getState();
  const from = isValidDate(query.from) ? query.from : data.start;
  const to = isValidDate(query.to) ? query.to : data.end;
  const region = REGION_BY_ID[query.region] ? query.region : 'all';
  const sensor = SENSOR_BY_ID[query.sensor] ? query.sensor : 'all';
  return {
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    region,
    sensor,
  };
}

function scopeDays(scope, { ignoreRegion = false, ignoreSensor = false } = {}) {
  const { days } = getState();
  return days.filter((record) => {
    if (record.date < scope.from || record.date > scope.to) return false;
    if (!ignoreRegion && scope.region !== 'all' && record.regionId !== scope.region) return false;
    if (!ignoreSensor && scope.sensor !== 'all' && !record.sensor[scope.sensor]?.n) return false;
    return true;
  });
}

function countOf(record, sensor) {
  return sensor === 'all' ? record.detections : record.sensor[sensor]?.n ?? 0;
}

function firesOf(record, sensor) {
  if (sensor === 'all') return record.fires;
  return Math.round((record.sensor[sensor]?.n ?? 0) * 0.72);
}

function frpOf(record, sensor) {
  return sensor === 'all' ? record.frp : record.sensor[sensor]?.frp ?? 0;
}

function confidenceOf(record, sensor) {
  return sensor === 'all' ? record.confidence : record.sensor[sensor]?.conf ?? 0;
}

function classesOf(record, sensor) {
  const total = countOf(record, sensor);
  if (!total) return Object.fromEntries(INTENSITY_CLASSES.map((c) => [c.id, 0]));
  const dayTotal = record.detections || 1;
  const fractions = INTENSITY_CLASSES.map((c) => (record.classes[c.id] || 0) / dayTotal);
  const values = distribute(total, fractions);
  return Object.fromEntries(INTENSITY_CLASSES.map((c, index) => [c.id, values[index]]));
}

function emptyClasses() {
  return Object.fromEntries(INTENSITY_CLASSES.map((c) => [c.id, 0]));
}

function addClasses(target, source) {
  for (const c of INTENSITY_CLASSES) target[c.id] += source[c.id] || 0;
}

function totals(records, sensor) {
  let detections = 0;
  let fires = 0;
  let frpWeighted = 0;
  let confidenceWeighted = 0;
  let highConfidence = 0;
  let activeDays = 0;
  const classes = emptyClasses();

  for (const record of records) {
    const count = countOf(record, sensor);
    if (!count) continue;
    activeDays += 1;
    detections += count;
    fires += firesOf(record, sensor);
    frpWeighted += frpOf(record, sensor) * count;
    const confidence = confidenceOf(record, sensor);
    confidenceWeighted += confidence * count;
    if (confidence >= 75) highConfidence += count;
    addClasses(classes, classesOf(record, sensor));
  }

  return {
    detections,
    fires,
    meanFrp: detections ? round(frpWeighted / detections, 1) : 0,
    meanConfidence: detections ? round(confidenceWeighted / detections, 1) : 0,
    highConfidenceShare: detections ? round(highConfidence / detections, 4) : 0,
    activeDays,
    classes,
  };
}

function groupBy(records, keyFn) {
  const map = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}

function rangeDays(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}

function previousScope(scope) {
  const length = Date.parse(scope.to) - Date.parse(scope.from);
  const previousTo = isoDate(new Date(Date.parse(scope.from) - DAY_MS));
  const previousFrom = isoDate(new Date(Date.parse(scope.from) - DAY_MS - length));
  return { ...scope, from: previousFrom, to: previousTo };
}

function classesToMix(classes, total) {
  return INTENSITY_CLASSES.map((c) => ({
    id: c.id,
    label: c.label,
    color: c.color,
    count: classes[c.id] || 0,
    share: total ? round((classes[c.id] || 0) / total, 4) : 0,
  }));
}

function calibrationSnapshot(scope) {
  const calibration = buildCalibration(scope);
  return {
    matchRate: calibration.summary.matchRate,
    matchedPairs: calibration.summary.matchedPairs,
    frpBias: calibration.summary.frpBias,
    timingOffset: calibration.summary.timingOffset,
    highAnchor: calibration.anchors.find((a) => a.label === 'H')?.mean ?? null,
    window: calibration.summary.window,
  };
}

/** ── META ────────────────────────────────────────────────── */
export function getMeta() {
  const data = getState();
  return {
    mode: 'mock',
    mock: true,
    sourceLabel: 'Illustrative mock record',
    generatedAt: data.generatedAt,
    disclaimer:
      'Every value is synthetic and illustrative. Replace the data source in server/data/source.js when your cleaned record is ready.',
    range: { min: data.start, max: data.end },
    years: data.years,
    baselineYears: data.baselineYears,
    regions: REGIONS.map(({ id, name, country, lat, lon }) => ({ id, name, country, lat, lon })),
    sensors: SENSORS.map(({ id, name, short, family, pixel, confidence, since, dataFrom }) => ({
      id,
      name,
      short,
      family,
      pixel,
      confidence,
      since,
      dataFrom: dataFrom ?? null,
    })),
    intensityClasses: INTENSITY_CLASSES,
    channels: {
      api: 'web/src/lib/api.js',
      source: 'server/data/source.js',
      postgresExample: 'server/data/postgres.example.js',
      schema: 'server/sql/schema.sql',
    },
  };
}

/** ── OVERVIEW ────────────────────────────────────────────── */
export function getOverview(query) {
  const data = getState();
  const scope = normalizeScope(query);
  const records = scopeDays(scope);
  const current = totals(records, scope.sensor);

  // Only compare against a fully contained prior window. A partial
  // window (e.g. 2012–2018 when the record starts in 2018) makes
  // percentage deltas meaningless, so we report no delta instead.
  const previous = previousScope(scope);
  const comparable = previous.from >= data.start;
  const previousRecords = comparable ? scopeDays(previous) : [];
  const prior = totals(previousRecords, scope.sensor);

  const monthGroups = groupBy(records, (record) => record.monthKey);
  const monthly = [...monthGroups.entries()].map(([key, rows]) => {
    const summary = totals(rows, scope.sensor);
    return {
      period: key,
      label: monthLabel(key),
      detections: summary.detections,
      fires: summary.fires,
      frp: summary.meanFrp,
      confidence: summary.meanConfidence,
      classes: summary.classes,
    };
  });

  const regionGroups = groupBy(records, (record) => record.regionId);
  const previousRegionGroups = groupBy(previousRecords, (record) => record.regionId);
  const topRegions = [...regionGroups.entries()]
    .map(([regionId, rows]) => {
      const summary = totals(rows, scope.sensor);
      const priorSummary = totals(previousRegionGroups.get(regionId) || [], scope.sensor);
      return {
        id: regionId,
        name: REGION_BY_ID[regionId]?.name ?? regionId,
        country: REGION_BY_ID[regionId]?.country ?? '',
        detections: summary.detections,
        fires: summary.fires,
        frp: summary.meanFrp,
        share: current.detections ? round(summary.detections / current.detections, 4) : 0,
        delta: delta(summary.detections, priorSummary.detections),
      };
    })
    .sort((a, b) => b.detections - a.detections);

  const sensorMix = SENSORS.map((definition) => {
    let count = 0;
    for (const record of records) count += record.sensor[definition.id]?.n ?? 0;
    return {
      id: definition.id,
      name: definition.name,
      short: definition.short,
      family: definition.family,
      count,
      share: current.detections ? round(count / current.detections, 4) : 0,
    };
  }).filter((entry) => (scope.sensor === 'all' ? entry.count > 0 : entry.id === scope.sensor));

  const anomalyItems = getAnomalyItems(scope);
  const calibration = calibrationSnapshot(scope);

  const datesWithData = new Set(records.filter((r) => countOf(r, scope.sensor)).map((r) => r.date));
  let highCount = 0;
  let nominalCount = 0;
  let lowCount = 0;
  for (const record of records) {
    const count = countOf(record, scope.sensor);
    if (!count) continue;
    const confidence = confidenceOf(record, scope.sensor);
    if (confidence >= 75) highCount += count;
    else if (confidence >= 50) nominalCount += count;
    else lowCount += count;
  }
  const confidenceTotal = highCount + nominalCount + lowCount || 1;

  return {
    range: { from: scope.from, to: scope.to, days: rangeDays(scope.from, scope.to) },
    filters: { region: scope.region, sensor: scope.sensor },
    kpis: {
      detections: current.detections,
      detectionsDelta: delta(current.detections, prior.detections),
      fires: current.fires,
      firesDelta: delta(current.fires, prior.fires),
      meanFrp: current.meanFrp,
      frpDelta: delta(current.meanFrp, prior.meanFrp),
      highConfidenceShare: current.highConfidenceShare,
      highConfidenceDelta: delta(current.highConfidenceShare, prior.highConfidenceShare),
      anomalies: anomalyItems.length,
      anomalyDelta: comparable
        ? delta(anomalyItems.length, getAnomalyItems(previous).length)
        : null,
      activeDays: datesWithData.size,
      coverage: round(datesWithData.size / Math.max(1, rangeDays(scope.from, scope.to)), 4),
      regionsActive: new Set(
        records.filter((r) => countOf(r, scope.sensor)).map((r) => r.regionId),
      ).size,
    },
    monthly,
    intensityMix: classesToMix(current.classes, current.detections),
    sensorMix,
    topRegions,
    recentAnomalies: anomalyItems.slice(0, 4),
    confidence: {
      mean: current.meanConfidence,
      bands: [
        { id: 'high', label: 'High', value: round(highCount / confidenceTotal, 4) },
        { id: 'nominal', label: 'Nominal', value: round(nominalCount / confidenceTotal, 4) },
        { id: 'low', label: 'Low', value: round(lowCount / confidenceTotal, 4) },
      ],
    },
    calibration,
  };
}

/** ── MONTHLY / ANNUAL SERIES ─────────────────────────────── */
export function getTimeseries(query) {
  const scope = normalizeScope(query);
  const grain = query.grain === 'year' ? 'year' : 'month';
  const records = scopeDays(scope);
  const groups =
    grain === 'year'
      ? groupBy(records, (record) => String(record.year))
      : groupBy(records, (record) => record.monthKey);

  const series = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, rows]) => {
      const summary = totals(rows, scope.sensor);
      return {
        period: key,
        label: grain === 'year' ? key : monthLabel(key),
        detections: summary.detections,
        fires: summary.fires,
        frp: summary.meanFrp,
        confidence: summary.meanConfidence,
        classes: summary.classes,
      };
    });

  return { grain, range: scope, series };
}

/** ── CALENDAR ────────────────────────────────────────────── */
export function getCalendar(query) {
  const scope = normalizeScope(query);
  const data = getState();
  const requestedYear = Number(query.year);
  const year = data.years.includes(requestedYear) ? requestedYear : data.years[data.years.length - 1];

  const allRecords = scopeDays(scope);
  const yearRecords = allRecords.filter((record) => record.year === year);

  const byDate = new Map();
  for (const record of yearRecords) {
    const count = countOf(record, scope.sensor);
    const entry = byDate.get(record.date) || { detections: 0, frpWeighted: 0, anomaly: false };
    entry.detections += count;
    entry.frpWeighted += frpOf(record, scope.sensor) * count;
    entry.anomaly = entry.anomaly || (count > 0 && record.anomaly);
    byDate.set(record.date, entry);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, entry]) => {
      const [y, m, d] = date.split('-').map(Number);
      return {
        date,
        year: y,
        month: m,
        day: d,
        detections: entry.detections,
        frp: entry.detections ? round(entry.frpWeighted / entry.detections, 1) : 0,
        anomaly: entry.anomaly,
      };
    });

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const rows = yearRecords.filter((record) => record.month === index + 1);
    const summary = totals(rows, scope.sensor);
    return {
      month: index + 1,
      label: MONTHS[index],
      detections: summary.detections,
      frp: summary.meanFrp,
    };
  });

  const yearMonthGroups = groupBy(allRecords, (record) => `${record.year}-${record.month}`);
  const yearsMonths = [...yearMonthGroups.entries()]
    .map(([key, rows]) => {
      const [y, m] = key.split('-').map(Number);
      const summary = totals(rows, scope.sensor);
      return { year: y, month: m, detections: summary.detections, frp: summary.meanFrp };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  const climatologyGroups = groupBy(allRecords, (record) => String(record.doy));
  const climatology = Array.from({ length: 366 }, (_, index) => {
    const rows = climatologyGroups.get(String(index + 1)) || [];
    const summary = totals(rows, scope.sensor);
    const samples = rows.length || 1;
    return {
      doy: index + 1,
      detections: round(summary.detections / samples, 1),
      frp: summary.meanFrp,
    };
  });

  const monthDayGroups = groupBy(allRecords, (record) => `${record.month}-${record.day}`);
  const monthDay = [];
  for (let month = 1; month <= 12; month += 1) {
    const maxDay = month === 2 ? 29 : new Date(Date.UTC(2024, month, 0)).getUTCDate();
    for (let day = 1; day <= maxDay; day += 1) {
      const rows = monthDayGroups.get(`${month}-${day}`) || [];
      const summary = totals(rows, scope.sensor);
      monthDay.push({
        month,
        day,
        detections: rows.length ? round(summary.detections / rows.length, 1) : null,
        samples: rows.length,
      });
    }
  }

  const visibleRegions =
    scope.region === 'all' ? REGIONS : REGIONS.filter((region) => region.id === scope.region);
  const cycles = visibleRegions.map((region) => {
    const rows = allRecords.filter((record) => record.regionId === region.id);
    const sums = new Array(366).fill(0);
    const counts = new Array(366).fill(0);
    for (const record of rows) {
      const value = countOf(record, scope.sensor);
      sums[record.doy - 1] += value;
      counts[record.doy - 1] += 1;
    }
    const raw = sums.map((sum, index) => (counts[index] ? sum / counts[index] : 0));
    const smoothed = movingAverage(raw, 9);
    return {
      regionId: region.id,
      name: region.name,
      total: Math.round(sums.reduce((a, b) => a + b, 0)),
      values: smoothed.map((value) => round(value, 1)),
    };
  });

  const peak = days.reduce(
    (best, current) => (!best || current.detections > best.detections ? current : best),
    null,
  );
  const yearTotal = totals(yearRecords, scope.sensor);
  const anomalyCount = getAnomalyItems({ ...scope, from: `${year}-01-01`, to: `${year}-12-31` }).length;

  return {
    year,
    years: data.years,
    range: { from: scope.from, to: scope.to },
    days,
    monthly,
    yearsMonths,
    monthDay,
    climatology,
    cycles,
    peak,
    totals: {
      detections: yearTotal.detections,
      fires: yearTotal.fires,
      frp: yearTotal.meanFrp,
      anomalies: anomalyCount,
      activeDays: days.filter((d) => d.detections > 0).length,
    },
  };
}

function movingAverage(values, windowSize) {
  const length = values.length;
  return values.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -Math.floor(windowSize / 2); offset <= Math.floor(windowSize / 2); offset += 1) {
      const position = (index + offset + length) % length;
      sum += values[position];
      count += 1;
    }
    return sum / count;
  });
}

/** ── TRENDS ──────────────────────────────────────────────── */
export function getTrends(query) {
  const scope = normalizeScope(query);
  const records = scopeDays(scope);

  const annualGroups = groupBy(records, (record) => String(record.year));
  const annual = [...annualGroups.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, rows]) => {
      const summary = totals(rows, scope.sensor);
      return {
        year: Number(year),
        detections: summary.detections,
        fires: summary.fires,
        frp: summary.meanFrp,
        confidence: summary.meanConfidence,
        classes: summary.classes,
      };
    });

  const monthlyGroups = groupBy(records, (record) => record.monthKey);
  const monthly = [...monthlyGroups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, rows]) => {
      const summary = totals(rows, scope.sensor);
      return {
        period: key,
        label: monthLabel(key),
        detections: summary.detections,
        frp: summary.meanFrp,
      };
    });

  const allSensors = scopeDays(scope, { ignoreSensor: true });
  const sensorYearGroups = groupBy(allSensors, (record) => String(record.year));
  const sensorTrend = [...sensorYearGroups.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, rows]) => ({
      year: Number(year),
      sensors: Object.fromEntries(
        SENSORS.map((sensor) => [
          sensor.id,
          rows.reduce((sum, record) => sum + (record.sensor[sensor.id]?.n ?? 0), 0),
        ]),
      ),
    }));

  const rankingRecords = scopeDays(scope, { ignoreRegion: true });
  const rankingGroups = groupBy(rankingRecords, (record) => record.regionId);
  const regionRanking = [...rankingGroups.entries()]
    .map(([regionId, rows]) => {
      const summary = totals(rows, scope.sensor);
      return {
        id: regionId,
        name: REGION_BY_ID[regionId]?.name ?? regionId,
        detections: summary.detections,
        frp: summary.meanFrp,
      };
    })
    .sort((a, b) => b.detections - a.detections);

  const visibleRegions =
    scope.region === 'all' ? REGIONS : REGIONS.filter((region) => region.id === scope.region);
  const climatology = visibleRegions.map((region) => {
    const rows = records.filter((record) => record.regionId === region.id);
    const values = Array.from({ length: 12 }, (_, index) => {
      const monthRows = rows.filter((record) => record.month === index + 1);
      return totals(monthRows, scope.sensor).detections;
    });
    return { regionId: region.id, name: region.name, values, total: values.reduce((a, b) => a + b, 0) };
  });

  const latest = annual[annual.length - 1] || null;
  const beforeLatest = annual[annual.length - 2] || null;

  return {
    range: { from: scope.from, to: scope.to },
    annual,
    monthly,
    sensorTrend,
    regionRanking,
    climatology,
    summary: {
      detections: totals(records, scope.sensor).detections,
      peakYear: annual.reduce(
        (best, row) => (!best || row.detections > best.detections ? row : best),
        null,
      ),
      latestYear: latest?.year ?? null,
      yoy: latest && beforeLatest ? delta(latest.detections, beforeLatest.detections) : null,
      latestFrp: latest?.frp ?? 0,
      frpVsFirst:
        latest && annual[0] ? delta(latest.frp, annual[0].frp) : null,
      totalYears: annual.length,
    },
  };
}

/** ── ANOMALIES ───────────────────────────────────────────── */
function getAnomalyItems(scope) {
  const { anomalies } = getState();
  return anomalies
    .filter((item) => item.endDate >= scope.from && item.startDate <= scope.to)
    .filter((item) => scope.region === 'all' || item.regionId === scope.region)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export function getAnomalies(query) {
  const scope = normalizeScope(query);
  const severity = ['watch', 'advisory', 'critical'].includes(query.severity)
    ? query.severity
    : 'all';
  const data = getState();

  let items = getAnomalyItems(scope);
  if (severity !== 'all') items = items.filter((item) => item.severity === severity);

  const severityMix = ['critical', 'advisory', 'watch'].map((level) => ({
    id: level,
    label: level[0].toUpperCase() + level.slice(1),
    count: items.filter((item) => item.severity === level).length,
  }));

  const byRegionMap = new Map();
  for (const item of items) {
    const entry = byRegionMap.get(item.regionId) || {
      id: item.regionId,
      name: item.region,
      count: 0,
      critical: 0,
    };
    entry.count += 1;
    if (item.severity === 'critical') entry.critical += 1;
    byRegionMap.set(item.regionId, entry);
  }
  const byRegion = [...byRegionMap.values()].sort((a, b) => b.count - a.count);

  const records = scopeDays(scope);
  const dateGroups = groupBy(records, (record) => record.date);
  const series = [...dateGroups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, rows]) => {
      let observed = 0;
      let expected = 0;
      for (const record of rows) {
        const count = countOf(record, scope.sensor);
        observed += count;
        const share =
          scope.sensor === 'all'
            ? 1
            : (record.sensor[scope.sensor]?.n ?? 0) / Math.max(1, record.detections);
        expected += (data.baseline.get(`${record.regionId}|${record.doy}`) || 0) * share;
      }
      return {
        date,
        observed,
        expected: round(expected, 1),
      };
    });

  const flaggedDates = new Set();
  for (const item of items) {
    const cursor = new Date(`${item.startDate}T00:00:00Z`).getTime();
    const end = new Date(`${item.endDate}T00:00:00Z`).getTime();
    for (let stamp = cursor; stamp <= end; stamp += DAY_MS) {
      flaggedDates.add(new Date(stamp).toISOString().slice(0, 10));
    }
  }
  const dayCount = new Set(
    records.filter((record) => countOf(record, scope.sensor)).map((record) => record.date),
  ).size;

  return {
    range: { from: scope.from, to: scope.to },
    threshold: 2.5,
    baselineYears: data.baselineYears,
    summary: {
      flagged: items.length,
      flaggedDays: flaggedDates.size,
      shareOfActiveDays: dayCount ? round(flaggedDates.size / dayCount, 4) : 0,
      critical: items.filter((item) => item.severity === 'critical').length,
      advisory: items.filter((item) => item.severity === 'advisory').length,
      watch: items.filter((item) => item.severity === 'watch').length,
      maxZ: items.length ? round(Math.max(...items.map((item) => Math.abs(item.z))), 2) : 0,
      mostAffectedRegion: byRegion[0] || null,
    },
    severityMix,
    byRegion,
    items: items.slice(0, 100),
    totalItems: items.length,
    series,
  };
}

/** ── CALIBRATION ─────────────────────────────────────────── */
export function getCalibration(query) {
  return buildCalibration(normalizeScope(query));
}

function buildCalibration(scope) {
  const records = scopeDays(scope);
  const byYear = groupBy(records, (record) => String(record.year));
  const years = [...byYear.keys()].map(Number).sort();
  const indexOf = new Map(years.map((year, index) => [year, index]));

  let matchedPairs = 0;
  let viirsTotal = 0;
  let modisTotal = 0;
  const pairsByYear = [];

  for (const year of years) {
    const rows = byYear.get(String(year)) || [];
    const modis = rows.reduce(
      (sum, record) =>
        sum + (record.sensor.terra?.n ?? 0) + (record.sensor.aqua?.n ?? 0),
      0,
    );
    const viirs = rows.reduce(
      (sum, record) =>
        sum +
        (record.sensor.snpp?.n ?? 0) +
        (record.sensor.noaa20?.n ?? 0) +
        (record.sensor.noaa21?.n ?? 0),
      0,
    );
    const index = indexOf.get(year) || 0;
    const rate = 0.742 + 0.018 * Math.sin(index * 1.3) + index * 0.004;
    const matched = Math.round(viirs * rate);
    modisTotal += modis;
    viirsTotal += viirs;
    matchedPairs += matched;
    pairsByYear.push({ year, modis, viirs, matched, rate: round(rate, 4) });
  }

  const matchRate = viirsTotal ? round(matchedPairs / viirsTotal, 4) : 0;
  const anchors = [
    { label: 'Low', code: 'L', mean: 33.6, low: 27.4, high: 39.8, n: Math.round(matchedPairs * 0.27) },
    { label: 'Nominal', code: 'N', mean: 61.9, low: 54.6, high: 69.2, n: Math.round(matchedPairs * 0.44) },
    { label: 'High', code: 'H', mean: 86.3, low: 79.8, high: 92.1, n: Math.round(matchedPairs * 0.29) },
  ];

  const reliability = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((predicted) => ({
    predicted,
    observed: round(Math.max(0.05, predicted - 0.035 + 0.012 * Math.sin(predicted * 7)), 4),
    n: Math.round(matchedPairs * 0.04 + predicted * 900),
  }));

  const modisShape = [2, 3, 5, 8, 12, 17, 20, 16, 11, 6];
  const modisBinTotal = modisShape.reduce((a, b) => a + b, 0);
  const histograms = [
    {
      id: 'terra',
      name: 'MODIS · Terra',
      family: 'MODIS',
      bins: ['0–10', '10–20', '20–30', '30–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100'],
      shares: modisShape.map((value) => round(value / modisBinTotal, 4)),
      count: Math.round(modisTotal / 2),
    },
    {
      id: 'aqua',
      name: 'MODIS · Aqua',
      family: 'MODIS',
      bins: ['0–10', '10–20', '20–30', '30–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100'],
      shares: modisShape.map((value) => round((value * 0.95) / modisBinTotal, 4)),
      count: Math.round(modisTotal / 2),
    },
    {
      id: 'viirs',
      name: 'VIIRS · all platforms',
      family: 'VIIRS',
      bins: ['Low', 'Nominal', 'High'],
      shares: [0.26, 0.44, 0.3],
      count: viirsTotal,
    },
  ];

  const uncertainty = years.map((year, index) => ({
    year,
    p10: round(0.28 - index * 0.012, 3),
    p50: round(0.22 - index * 0.011, 3),
    p90: round(0.52 - index * 0.018, 3),
  }));

  // Per-region pair counts come from each region's own VIIRS volume, so the
  // table reflects where the overlaps actually occurred.
  const viirsByRegion = new Map();
  for (const record of records) {
    const viirs =
      (record.sensor.snpp?.n ?? 0) +
      (record.sensor.noaa20?.n ?? 0) +
      (record.sensor.noaa21?.n ?? 0);
    viirsByRegion.set(record.regionId, (viirsByRegion.get(record.regionId) || 0) + viirs);
  }

  const regionAgreement = (scope.region === 'all' ? REGIONS : REGIONS.filter((r) => r.id === scope.region)).map(
    (region, index) => {
      const regionRate = round(
        Math.min(0.95, Math.max(0.55, matchRate + 0.03 * Math.sin(index * 1.7 + 0.4))),
        4,
      );
      return {
        id: region.id,
        name: region.name,
        matchRate: regionRate,
        frpBias: round(-4.3 + 3.1 * Math.cos(index * 1.2), 2),
        timingOffset: Math.round(31 + 9 * Math.sin(index * 0.9)),
        pairs: Math.round((viirsByRegion.get(region.id) || 0) * regionRate),
      };
    },
  );

  return {
    range: { from: scope.from, to: scope.to },
    summary: {
      matchedPairs,
      viirsTotal,
      modisTotal,
      matchRate,
      frpBias: round(-3.8 + 0.4 * Math.sin(years.length), 2),
      timingOffset: 34,
      iou: 0.681,
      window: '1.5 km · 60 min',
      baselineYears: getState().baselineYears,
      method:
        'VIIRS detections are paired with the nearest MODIS detection inside a 1.5 km / 60 min window. MODIS confidence percentages are averaged per VIIRS class to produce global L / N / H anchors.',
    },
    pairsByYear,
    anchors,
    reliability,
    histograms,
    uncertainty,
    regionAgreement,
  };
}

/** ── MAP ─────────────────────────────────────────────────── */
function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickWeightedSensor(record, random) {
  const entries = SENSORS.map((sensor) => ({
    id: sensor.id,
    weight: record.sensor[sensor.id]?.n ?? 0,
  })).filter((entry) => entry.weight > 0);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!total) return null;
  let target = random() * total;
  for (const entry of entries) {
    target -= entry.weight;
    if (target <= 0) return entry.id;
  }
  return entries[entries.length - 1].id;
}

function confidenceLabel(family, frp, random) {
  if (family === 'MODIS') {
    const value = Math.round(Math.min(99, 32 + frp * 0.55 + random() * 18));
    return { value, label: value >= 75 ? 'High' : value >= 50 ? 'Nominal' : 'Low' };
  }
  const score = random() + frp / 220;
  if (score > 1.05) return { value: null, label: 'High' };
  if (score > 0.62) return { value: null, label: 'Nominal' };
  return { value: null, label: 'Low' };
}

export function getMap(query) {
  const data = getState();
  const scope = normalizeScope(query);
  const requestedYear = Number(query.year);
  const year = data.years.includes(requestedYear) ? requestedYear : data.years[data.years.length - 1];
  const requestedMonth = Number(query.month);
  const month = requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : 8;
  const mode = query.mode === 'harmonized' ? 'harmonized' : 'raw';

  const records = scopeDays({
    ...scope,
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-31`,
  });

  const points = [];
  let totalDetections = 0;
  let totalFires = 0;
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  for (const record of records) {
    const detections = countOf(record, scope.sensor);
    const fires = firesOf(record, scope.sensor);
    totalDetections += detections;
    totalFires += fires;
    const value = mode === 'harmonized' ? fires : detections;
    if (!value) continue;

    const region = REGION_BY_ID[record.regionId];
    if (!region) continue;
    const random = mulberry32(hashString(`${record.date}|${record.regionId}|${mode}`));
    const pointCount = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(value) / 3)));

    for (let index = 0; index < pointCount; index += 1) {
      if (points.length >= 3500) break;
      const sensorId =
        scope.sensor === 'all' ? pickWeightedSensor(record, random) : scope.sensor;
      if (!sensorId) continue;
      const sensor = SENSOR_BY_ID[sensorId];
      const sensorFrp = record.sensor[sensorId]?.frp ?? record.frp;
      const spread = region.jitter;
      const lat = region.lat + (random() + random() + random() - 1.5) * spread * 0.9;
      const lon = region.lon + (random() + random() + random() - 1.5) * spread * 1.25;
      const frp = round(Math.max(1, sensorFrp * Math.exp(0.62 * (random() * 2 - 1))), 1);
      const intensity =
        INTENSITY_CLASSES.find((c) => frp >= c.min && (c.max == null || frp < c.max)) ||
        INTENSITY_CLASSES[INTENSITY_CLASSES.length - 1];
      const confidence = confidenceLabel(sensor.family, frp, random);

      points.push({
        id: `${record.date}-${record.regionId}-${index}`,
        date: record.date,
        lat: round(Math.max(-85, Math.min(85, lat)), 4),
        lon: round(Math.max(-180, Math.min(180, lon)), 4),
        frp,
        weight: round(frp / 12 + 0.4, 2),
        intensity: { id: intensity.id, label: intensity.label, color: intensity.color },
        confidence,
        sensor: { id: sensor.id, name: sensor.name, family: sensor.family },
        region: { id: region.id, name: region.name, country: region.country },
      });

      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
    if (points.length >= 3500) break;
  }

  const avgFrp = points.length
    ? round(points.reduce((sum, point) => sum + point.frp, 0) / points.length, 1)
    : 0;

  return {
    year,
    month,
    mode,
    filters: { region: scope.region, sensor: scope.sensor },
    points,
    summary: {
      detections: mode === 'harmonized' ? totalFires : totalDetections,
      rawDetections: totalDetections,
      fires: totalFires,
      shown: points.length,
      maxFrp: points.length ? Math.max(...points.map((point) => point.frp)) : 0,
      avgFrp,
      dedupRate: totalDetections ? round(1 - totalFires / totalDetections, 3) : 0,
    },
    bounds:
      points.length > 0
        ? [
            [Math.max(-180, minLon - 4), Math.max(-70, minLat - 4)],
            [Math.min(180, maxLon + 4), Math.min(80, maxLat + 4)],
          ]
        : [
            [-170, -55],
            [170, 70],
          ],
  };
}

/** ── THE SWITCH ──────────────────────────────────────────── */
// When your Postgres queries are ready:
//
//   1. Copy server/data/postgres.example.js → server/data/postgres.js
//   2. Implement the queries. Keep each response shape identical.
//   3. Uncomment the import below and flip the export.
//
// import { source as postgresSource } from './postgres.js';

const mockSource = {
  getMeta,
  getOverview,
  getTimeseries,
  getCalendar,
  getTrends,
  getAnomalies,
  getCalibration,
  getMap,
  mode: 'mock',
  disclaimer: config.databaseUrl
    ? 'DATABASE_URL is set, but the Postgres adapter has not been wired yet. Showing the illustrative mock record.'
    : 'Showing the illustrative mock record.',
};

export const source = mockSource;
