import { describe, expect, it } from "vitest";
import { compressedScale, DEFAULT_LAYOUT, layoutTimeline, timeOf, yearTicks } from "./timeline";

describe("timeOf", () => {
  it("prefers the decision year and spreads by sequence", () => {
    expect(timeOf("K231234", 2024)).toBeCloseTo(2024.1234);
  });

  it("falls back to the identifier's year", () => {
    expect(timeOf("K991234", 0)).toBeCloseTo(1999.1234);
    expect(timeOf("K050001", 0)).toBeCloseTo(2005.0001);
    expect(timeOf("DEN200012", 0)).toBeCloseTo(2020.0012);
  });
});

describe("layoutTimeline", () => {
  it("places the focal device at the origin and time on x", () => {
    const { positions, pxPerYear } = layoutTimeline(
      [
        { node: 1, time: 2010, generation: 0 },
        { node: 2, time: 2009, generation: -1 },
      ],
      [[1, 2]],
      1,
    );
    expect(positions.get(1)).toEqual({ x: 0, y: 0 });
    expect(positions.get(2)?.x).toBe(-pxPerYear);
  });

  it("never overlaps nodes in a lane", () => {
    const nodes = Array.from({ length: 40 }, (_, i) => ({
      node: i,
      time: 2010 + (i % 3) * 0.1,
      generation: i === 0 ? 0 : -1,
    }));
    const pos = [...layoutTimeline(nodes, [], 0).positions.values()];
    for (const a of pos)
      for (const b of pos)
        if (a !== b && a.y === b.y)
          expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(DEFAULT_LAYOUT.minGap);
  });

  it("keeps a single chain on one lane", () => {
    const { positions: pos } = layoutTimeline(
      [
        { node: 0, time: 2020, generation: 0 },
        { node: 1, time: 2015, generation: -1 },
        { node: 2, time: 2010, generation: -2 },
      ],
      [
        [0, 1],
        [1, 2],
      ],
      0,
    );
    expect(new Set([...pos.values()].map((p) => p.y))).toEqual(new Set([0]));
  });
});

describe("compressedScale", () => {
  it("caps long gaps and anchors the origin at zero", () => {
    const xOf = compressedScale([1980, 2010, 2011], 2011, 10, 2);
    expect(xOf(2011)).toBe(0);
    expect(xOf(2010)).toBe(-10);
    expect(xOf(1980)).toBe(-30);
    expect(xOf(1995)).toBe(-20);
    expect(xOf(2013)).toBe(20);
  });
});

describe("layoutTimeline scale choice", () => {
  const chain = Array.from({ length: 12 }, (_, i) => ({ node: i, time: 2000 + i, generation: -i }));
  const links = chain.slice(1).map((n, i): [number, number] => [i, n.node]);

  it("keeps the widest scale when it already fits", () => {
    const roomy = { ...DEFAULT_LAYOUT, viewport: { width: 5000, height: 600 } };
    expect(layoutTimeline(chain, links, 0, roomy).pxPerYear).toBe(140);
  });

  it("tightens the scale for a narrow viewport", () => {
    const narrow = { ...DEFAULT_LAYOUT, viewport: { width: 700, height: 600 } };
    expect(layoutTimeline(chain, links, 0, narrow).pxPerYear).toBeLessThan(140);
  });
});

describe("yearTicks", () => {
  it("drops ticks that would collide", () => {
    const xOf = (t: number) => (t - 2000) * 30;
    expect(yearTicks(2000, 2006, xOf).map((t) => t.year)).toEqual([2000, 2002, 2004, 2006]);
    expect(yearTicks(2000.5, 2003, (t) => t * 100).map((t) => t.year)).toEqual([2001, 2002, 2003]);
  });
});
