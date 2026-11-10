import { INTENSITY_CLASSES, REGIONS, SENSORS } from './catalog.js';

/**
 * ─────────────────────────────────────────────────────────────
 *  ILLUSTRATIVE MOCK RECORD
 * ─────────────────────────────────────────────────────────────
 * This generator exists so the interface can be built, demoed
 * and judged before the cleaned record is connected.
 *
 * Every number below is synthetic and deterministic: the same
 * seed always produces the same record, which keeps screenshots
 * and chart comparisons stable.
 *
 * When your data is ready, delete this file from the data path
 * (see server/data/source.js) and point the same response
 * shapes at Postgres. The UI will not need to change.
 */
const DAY_MS = 86_400_000;
const START = Date.UTC(2018, 0, 1);
const END = Date.UTC(2025, 11, 31);
const BASELINE_END_YEAR = 2022;
const YEAR_FACTOR = {
  2018: 0.9,
  2019: 1.06,
  2020: 1.13,
  2021: 0.96,
  2022: 1.01,
  2023: 1.12,
  2024: 1.26,
  2025: 1.04,
};
const SENSOR_TOTAL_WEIGHT = SENSORS.reduce((sum, s) => sum + s.weight, 0);
// Used to detrend the baseline before flagging anomalies.
const BASELINE_YEAR_FACTOR =
  [2018, 2019, 2020, 2021, 2022].reduce((sum, year) => sum + (YEAR_FACTOR[year] ?? 1), 0) / 5;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / DAY_MS) + 1;
}

/** Gaussian shape on a circular 365-day year. */
function seasonShape(doy, peakDay, spread) {
  const raw = Math.abs(doy - peakDay);
  const distance = Math.min(raw, 365 - raw);
  return Math.exp(-(distance * distance) / (2 * spread * spread));
}

function normalize(value) {
  const mean = value.reduce((a, b) => a + b, 0) / value.length;
  const variance =
    value.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, value.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

/** Split an integer total across fractions without losing a count. */
function splitInts(total, fractions) {
  if (total <= 0) return fractions.map(() => 0);
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

/** Normal CDF — enough precision for class splitting. */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * A lognormal fire-size distribution produces a realistic long tail:
 * many small fires, few intense ones. Thresholds come from the shared
 * INTENSITY_CLASSES vocabulary.
 */
function intensityFractions(meanFrp) {
  const sigma = 0.82;
  const median = Math.max(1, meanFrp) / Math.exp((sigma * sigma) / 2);
  const thresholds = [10, 25, 50, 100];
  const cdf = thresholds.map((x) =>
    normalCdf((Math.log(x) - Math.log(median)) / sigma),
  );
  const fractions = [];
  let previous = 0;
  for (const point of cdf) {
    fractions.push(Math.max(0, point - previous));
    previous = point;
  }
  fractions.push(Math.max(0, 1 - previous));
  return fractions;
}

function classify(frp) {
  return (
    INTENSITY_CLASSES.find((c) => frp >= c.min && (c.max == null || frp < c.max)) ||
    INTENSITY_CLASSES[INTENSITY_CLASSES.length - 1]
  );
}

function buildSmoothedBaseline(days) {
  const byRegion = new Map();
  for (const record of days) {
    if (record.year > BASELINE_END_YEAR) continue;
    if (!byRegion.has(record.regionId)) byRegion.set(record.regionId, new Map());
    const byDoy = byRegion.get(record.regionId);
    if (!byDoy.has(record.doy)) byDoy.set(record.doy, { counts: [], frps: [] });
    const bucket = byDoy.get(record.doy);
    bucket.counts.push(record.detections);
    bucket.frps.push(record.frp);
  }

  const out = new Map();
  for (const [regionId, byDoy] of byRegion) {
    for (let doy = 1; doy <= 366; doy += 1) {
      const counts = [];
      const frps = [];
      for (let offset = -7; offset <= 7; offset += 1) {
        const shifted = ((doy - 1 + offset + 366) % 366) + 1;
        const bucket = byDoy.get(shifted);
        if (!bucket) continue;
        counts.push(...bucket.counts);
        frps.push(...bucket.frps);
      }
      if (counts.length < 10) continue;
      const count = normalize(counts);
      const frp = normalize(frps);
      out.set(`${regionId}|${doy}`, {
        count: { mean: count.mean, std: Math.max(count.std, count.mean * 0.08, 2) },
        frp: { mean: frp.mean, std: Math.max(frp.std, frp.mean * 0.03, 0.6) },
      });
    }
  }
  return out;
}

function buildEpisodes(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.regionId}|${candidate.kind}|${candidate.direction}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }

  const episodes = [];
  for (const list of groups.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    let current = null;

    const flush = () => {
      if (!current) return;
      const peakZ = Math.abs(current.z);
      const severity = peakZ >= 4 ? 'critical' : peakZ >= 3.2 ? 'advisory' : 'watch';
      // A lone mild wobble is not a story; keep single days only when strong.
      if (current.days === 1 && severity === 'watch') {
        current = null;
        return;
      }
      const metric = current.kind === 'count' ? 'Detection count' : 'Mean fire radiative power';
      episodes.push({
        id: `ep-${current.regionId}-${current.kind}-${current.startDate}`,
        date: current.peakDate,
        peakDate: current.peakDate,
        startDate: current.startDate,
        endDate: current.endDate,
        days: current.days,
        regionId: current.regionId,
        region: current.region,
        observed: current.observed,
        expected: current.expected,
        z: current.z,
        kind: current.kind,
        severity,
        direction: current.direction,
        deviationPct: Number(
          (((current.observed - current.expected) / Math.max(1, current.expected)) * 100).toFixed(1),
        ),
        note:
          `${metric} stayed ${current.direction} the 2018–2022 seasonal baseline ` +
          `for ${current.days} ${current.days === 1 ? 'day' : 'days'}.`,
      });
      current = null;
    };

    for (const candidate of list) {
      if (current) {
        const gap = (Date.parse(candidate.date) - Date.parse(current.endDate)) / DAY_MS;
        if (gap <= 2) {
          current.endDate = candidate.date;
          current.days += 1;
          if (Math.abs(candidate.z) > Math.abs(current.z)) {
            current.z = candidate.z;
            current.peakDate = candidate.date;
            current.observed = candidate.observed;
            current.expected = candidate.expected;
          }
          continue;
        }
      }
      flush();
      current = {
        ...candidate,
        startDate: candidate.date,
        endDate: candidate.date,
        peakDate: candidate.date,
        days: 1,
      };
    }
    flush();
  }

  return episodes.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export function buildDataset() {
  const random = mulberry32(0x5eed1e);
  const days = [];
  for (let stamp = START; stamp <= END; stamp += DAY_MS) {
    const date = new Date(stamp);
    const dateString = iso(date);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const doy = dayOfYear(date);

    for (const region of REGIONS) {
      const shape = 0.06 + 0.94 * seasonShape(doy, region.peakDay, region.spread);
      const boost = region.yearBoost?.[year] ?? 1;
      let detections = region.base * shape * (YEAR_FACTOR[year] ?? 1) * boost;
      detections *= 0.62 + 0.76 * random();
      // Occasional fire-weather outbreaks, the raw material for anomalies.
      const outbreak = random() < 0.0045;
      if (outbreak) detections *= 1.7 + 3.0 * random();
      detections = Math.max(0, Math.round(detections));

      const frp = Number(
        (
          region.frp *
          (0.82 + 0.36 * random()) *
          (1 + 0.1 * ((year - 2021) / 4)) *
          (outbreak ? 1.25 + 0.45 * random() : 1)
        ).toFixed(1),
      );
      const confidence = Number(
        clamp(55 + 32 * Math.min(1, frp / 70) + (random() - 0.5) * 10, 25, 97).toFixed(1),
      );
      const fires = Math.max(0, Math.round(detections * (0.55 + 0.08 * random())));

      const classFractions = intensityFractions(frp);
      const classCounts = splitInts(detections, classFractions);
      const classes = Object.fromEntries(
        INTENSITY_CLASSES.map((c, index) => [c.id, classCounts[index]]),
      );

      const rawWeights = SENSORS.map((s) =>
        year >= (s.dataFrom ?? 2000)
          ? (s.weight / SENSOR_TOTAL_WEIGHT) * (0.9 + 0.2 * random())
          : 0,
      );
      const weightSum = rawWeights.reduce((a, b) => a + b, 0);
      const sensorCounts = splitInts(
        detections,
        rawWeights.map((w) => w / weightSum),
      );
      const sensor = {};
      SENSORS.forEach((definition, index) => {
        const count = sensorCounts[index];
        sensor[definition.id] = {
          n: count,
          frp: Number((frp * definition.frpBias * (0.95 + 0.1 * random())).toFixed(1)),
          conf: Number(clamp(confidence + (random() - 0.5) * 8, 18, 98).toFixed(1)),
        };
      });

      const record = {
        date: dateString,
        year,
        month,
        day,
        doy,
        monthKey: dateString.slice(0, 7),
        regionId: region.id,
        detections,
        fires,
        frp,
        confidence,
        classes,
        sensor,
        anomaly: false,
        anomalyZ: 0,
      };
      days.push(record);
    }
  }

  /**
   * A slightly wider seasonal baseline (same day ±7 days across 2018–2022)
   * is more stable than a single calendar-day comparison. It is still
   * illustrative, but it avoids flagging ordinary day-to-day noise.
   */
  const baselineWindow = buildSmoothedBaseline(days);

  const anomalies = [];
  const candidates = [];
  for (const record of days) {
    if (record.year <= BASELINE_END_YEAR) continue;
    const stats = baselineWindow.get(`${record.regionId}|${record.doy}`);
    if (!stats) continue;

    // Detrend the 2018–2022 baseline to the current record-wide level, so a
    // busy year is not flagged simply for being busy everywhere.
    const yearAdjust = (YEAR_FACTOR[record.year] ?? 1) / BASELINE_YEAR_FACTOR;
    const expectedCount = stats.count.mean * yearAdjust;
    const expectedFrp = stats.frp.mean * yearAdjust;
    const zCount = (record.detections - expectedCount) / (stats.count.std * yearAdjust);
    const zFrp = (record.frp - expectedFrp) / (stats.frp.std * yearAdjust);
    // Require a meaningful fire signal, not a small off-season wobble.
    const countMeaningful =
      expectedCount >= 35 &&
      record.detections >= 75 &&
      Math.abs(record.detections - expectedCount) >= Math.max(20, expectedCount * 0.3);
    const frpMeaningful =
      Math.abs(record.frp - expectedFrp) >= Math.max(6, expectedFrp * 0.22);

    record.anomaly = countMeaningful && Math.abs(zCount) >= 2.5;
    record.anomalyZ = Number(zCount.toFixed(2));

    const options = [];
    if (countMeaningful && Math.abs(zCount) >= 2.5) {
      options.push({
        kind: 'count',
        z: zCount,
        observed: record.detections,
        expected: expectedCount,
      });
    }
    if (frpMeaningful && Math.abs(zFrp) >= 2.5) {
      options.push({
        kind: 'intensity',
        z: zFrp,
        observed: record.frp,
        expected: expectedFrp,
      });
    }
    if (!options.length) continue;

    options.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const chosen = options[0];
    const region = REGIONS.find((r) => r.id === record.regionId);
    candidates.push({
      date: record.date,
      regionId: record.regionId,
      region: region?.name ?? record.regionId,
      kind: chosen.kind,
      z: Number(chosen.z.toFixed(2)),
      observed: Number(chosen.observed.toFixed(chosen.kind === 'count' ? 0 : 1)),
      expected: Number(chosen.expected.toFixed(chosen.kind === 'count' ? 1 : 1)),
      direction: chosen.z >= 0 ? 'above' : 'below',
    });
  }

  // Consecutive flagged days are one story, not fifty rows.
  for (const episode of buildEpisodes(candidates)) anomalies.push(episode);

  // A stable, inspectable list: strongest anomalies first.
  anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  return {
    days,
    anomalies,
    years: Object.keys(YEAR_FACTOR).map(Number),
    baselineYears: [2018, BASELINE_END_YEAR],
    start: iso(new Date(START)),
    end: iso(new Date(END)),
    generatedAt: new Date().toISOString(),
  };
}

export { clamp, classify, DAY_MS, mulberry32 };
