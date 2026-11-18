/**
 * Timeline layout: x is time, y is a lane chosen to sit near already-placed
 * neighbors without overlapping another node.
 *
 * Lineages often span decades with a few long empty stretches, so the time axis is
 * piecewise linear: a gap between consecutive devices longer than `maxGapYears` is
 * drawn as if it were `maxGapYears` long. Year ticks use the same scale.
 */

export interface TimelineNode {
  node: number;
  /** Fractional year, see `timeOf`. */
  time: number;
  /** Lineage generation; placement proceeds outward from 0. */
  generation: number;
}

export interface LayoutOptions {
  /** Candidate horizontal scales, largest first. See `layoutTimeline`. */
  pxPerYear: number[];
  laneHeight: number;
  /** Minimum horizontal distance between two nodes in the same lane. */
  minGap: number;
  maxGapYears: number;
  /** Size of the canvas the drawing will be fit into. */
  viewport: { width: number; height: number };
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  pxPerYear: [140, 100, 70, 50, 35],
  laneHeight: 30,
  minGap: 78,
  maxGapYears: 2,
  viewport: { width: 1200, height: 640 },
};

export interface TimelineLayout {
  positions: Map<number, { x: number; y: number }>;
  /** Maps a fractional year to x, consistent with `positions`. */
  xOf: (time: number) => number;
  pxPerYear: number;
}

/**
 * Approximate position in time for a submission. Uses the decision year when known and
 * the year encoded in the identifier otherwise; the sequence number spreads submissions
 * within a year (it only roughly tracks receipt order).
 */
export function timeOf(id: string, decisionYear: number): number {
  let year = decisionYear;
  let seq = 0;
  const k = /^K(\d{2})(\d{4})$/.exec(id);
  const den = /^DEN(\d{2})(\d{4})$/.exec(id);
  if (k) {
    const yy = Number(k[1]);
    year ||= yy >= 76 ? 1900 + yy : 2000 + yy;
    seq = Number(k[2]);
  } else if (den) {
    year ||= 2000 + Number(den[1]);
    seq = Number(den[2]);
  }
  return year + Math.min(seq / 10000, 0.95);
}

/** Piecewise-linear time scale with long gaps capped, anchored so `origin` maps to 0. */
export function compressedScale(
  times: number[],
  origin: number,
  pxPerYear: number,
  maxGapYears: number,
): (time: number) => number {
  const knots = [...new Set(times)].sort((a, b) => a - b);
  const xs: number[] = [0];
  for (let i = 1; i < knots.length; i++) {
    const gap = (knots[i] as number) - (knots[i - 1] as number);
    xs.push((xs[i - 1] as number) + Math.min(gap, maxGapYears) * pxPerYear);
  }
  const raw = (t: number): number => {
    const first = knots[0] ?? 0;
    const last = knots.length - 1;
    if (t <= first) return (t - first) * pxPerYear;
    if (t >= (knots[last] as number))
      return (xs[last] as number) + (t - (knots[last] as number)) * pxPerYear;
    let i = 1;
    while ((knots[i] as number) < t) i++;
    const [t0, t1] = [knots[i - 1] as number, knots[i] as number];
    const [x0, x1] = [xs[i - 1] as number, xs[i] as number];
    return x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
  };
  const shift = raw(origin);
  return (t) => raw(t) - shift;
}

/**
 * Lays out at each candidate scale and keeps the most spacious one that is still
 * nearly as readable as the best: readability is the zoom needed to fit the drawing
 * in the viewport, capped at 1 since enlarging past full size gains nothing.
 */
export function layoutTimeline(
  nodes: TimelineNode[],
  edges: [number, number][],
  focal: number,
  options: LayoutOptions = DEFAULT_LAYOUT,
): TimelineLayout {
  const attempts = [...options.pxPerYear]
    .sort((a, b) => b - a)
    .map((pxPerYear) => {
      const attempt = placeAt(nodes, edges, focal, pxPerYear, options);
      const xs = [...attempt.positions.values()].map((p) => p.x);
      const ys = [...attempt.positions.values()].map((p) => p.y);
      const width = Math.max(...xs) - Math.min(...xs) + options.minGap;
      const height = Math.max(...ys) - Math.min(...ys) + options.laneHeight;
      const zoom = Math.min(1, options.viewport.width / width, options.viewport.height / height);
      return { attempt, zoom };
    });
  const bestZoom = Math.max(...attempts.map((a) => a.zoom));
  const chosen = attempts.find((a) => a.zoom >= bestZoom * 0.9) ?? attempts[0];
  return (chosen as { attempt: TimelineLayout }).attempt;
}

function placeAt(
  nodes: TimelineNode[],
  edges: [number, number][],
  focal: number,
  pxPerYear: number,
  options: LayoutOptions,
): TimelineLayout {
  const focalTime = nodes.find((n) => n.node === focal)?.time ?? 0;
  const xOf = compressedScale(
    nodes.map((n) => n.time),
    focalTime,
    pxPerYear,
    options.maxGapYears,
  );
  const neighbors = new Map<number, number[]>();
  for (const [a, b] of edges) {
    if (!neighbors.has(a)) neighbors.set(a, []);
    if (!neighbors.has(b)) neighbors.set(b, []);
    neighbors.get(a)?.push(b);
    neighbors.get(b)?.push(a);
  }

  const order = [...nodes].sort(
    (a, b) =>
      (a.node === focal ? -1 : 0) - (b.node === focal ? -1 : 0) ||
      Math.abs(a.generation) - Math.abs(b.generation) ||
      a.time - b.time ||
      a.node - b.node,
  );

  const lanes = new Map<number, number[]>();
  const placed = new Map<number, { x: number; lane: number }>();
  const free = (lane: number, x: number) =>
    (lanes.get(lane) ?? []).every((other) => Math.abs(other - x) >= options.minGap);

  for (const n of order) {
    const x = xOf(n.time);
    const placedNeighbors = (neighbors.get(n.node) ?? [])
      .map((m) => placed.get(m))
      .filter((p) => p !== undefined);
    const preferred =
      placedNeighbors.length > 0
        ? Math.round(placedNeighbors.reduce((s, p) => s + p.lane, 0) / placedNeighbors.length)
        : 0;
    let lane = preferred;
    for (let step = 0; !free(lane, x); step++) {
      lane = preferred + (step % 2 === 0 ? step / 2 + 1 : -(step + 1) / 2);
    }
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane)?.push(x);
    placed.set(n.node, { x, lane });
  }

  return {
    positions: new Map(
      [...placed].map(([node, p]) => [node, { x: p.x, y: p.lane * options.laneHeight }]),
    ),
    xOf,
    pxPerYear,
  };
}

/** Whole-year ticks across `[minTime, maxTime]`, dropping any closer than `minPx` to the previous one. */
export function yearTicks(
  minTime: number,
  maxTime: number,
  xOf: (time: number) => number,
  minPx = 56,
): { year: number; x: number }[] {
  const ticks: { year: number; x: number }[] = [];
  for (let year = Math.ceil(minTime); year <= maxTime; year++) {
    const x = xOf(year);
    const last = ticks[ticks.length - 1];
    if (!last || x - last.x >= minPx) ticks.push({ year, x });
  }
  return ticks;
}
