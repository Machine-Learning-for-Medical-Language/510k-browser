import { describe, expect, it } from "vitest";
import { makeCore } from "./fixtures";
import { citationCount, lineage, mostCited, predicateCoverageYear, predicates } from "./lineage";

// K1 <- K2 <- K3 <- K4, plus K5 also citing K2 and K6 citing K3.
const core = makeCore(
  ["K1", "K2", "K3", "K4", "K5", "K6"].map((id, i) => ({ id, year: 2000 + i })),
  [
    ["K2", "K1"],
    ["K3", "K2"],
    ["K4", "K3"],
    ["K5", "K2"],
    ["K6", "K3"],
  ],
);
const n = (id: string) => core.index.get(id) as number;

describe("lineage", () => {
  it("walks ancestors and descendants to the requested depth", () => {
    const view = lineage(core.graph, n("K3"), 1, 1, 100);
    expect(Object.fromEntries([...view.generation].map(([k, g]) => [core.ids[k], g]))).toEqual({
      K3: 0,
      K2: -1,
      K4: 1,
      K6: 1,
    });
    expect(view.truncated).toBe(false);
  });

  it("omits siblings reached only sideways", () => {
    const view = lineage(core.graph, n("K3"), 2, 0, 100);
    expect([...view.generation.keys()].map((k) => core.ids[k]).sort()).toEqual(["K1", "K2", "K3"]);
    expect(view.edges).toHaveLength(2);
  });

  it("caps the node count and reports truncation", () => {
    const view = lineage(core.graph, n("K3"), 5, 5, 3);
    expect(view.generation.size).toBe(3);
    expect(view.truncated).toBe(true);
  });

  it("terminates on cycles", () => {
    const cyclic = makeCore(
      [{ id: "A" }, { id: "B" }],
      [
        ["A", "B"],
        ["B", "A"],
      ],
    );
    const view = lineage(cyclic.graph, 0, 10, 10, 100);
    expect(view.generation.size).toBe(2);
    expect(view.edges).toHaveLength(2);
  });
});

describe("graph helpers", () => {
  it("reads CSR neighbors and citation counts", () => {
    expect(predicates(core.graph, n("K3")).map((k) => core.ids[k])).toEqual(["K2"]);
    expect(citationCount(core.graph, n("K2"))).toBe(2);
    expect(citationCount(core.graph, n("K4"))).toBe(0);
  });

  it("ranks most-cited nodes with stable ties", () => {
    expect(mostCited(core.graph, 3).map((k) => core.ids[k])).toEqual(["K2", "K3", "K1"]);
  });

  it("finds the latest year with predicate coverage", () => {
    expect(predicateCoverageYear(core.graph, core.search.year)).toBe(2005);
  });
});
