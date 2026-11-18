import { describe, expect, it } from "vitest";
import { makeCore } from "./fixtures";
import { buildIndex, search } from "./search";

const core = makeCore(
  [
    { id: "K200001", name: "Cardiac Catheter", applicant: "Acme Medical", code: "DQY", year: 2020 },
    { id: "K230001", name: "Guide Catheter", applicant: "Beta Corp", code: "DQY", year: 2023 },
    { id: "K230002", name: "Hip Implant", applicant: "Acme Medical", code: "LZO", year: 2023 },
    { id: "K990001", name: "Old Catheter DQY", applicant: "Gamma", code: "ABC", year: 1999 },
  ],
  [["K230001", "K200001"]],
);
const index = buildIndex(core);
const ids = (q: string, filters = {}) => search(index, q, filters).nodes.map((n) => core.ids[n]);

describe("search", () => {
  it("matches every term across name, applicant and product code", () => {
    expect(ids("catheter acme")).toEqual(["K200001"]);
    expect(ids("LZO")).toEqual(["K230002"]);
  });

  it("ranks exact product codes, then citations, then newest", () => {
    expect(ids("dqy")).toEqual(["K200001", "K230001", "K990001"]);
    expect(ids("catheter")).toEqual(["K200001", "K230001", "K990001"]);
  });

  it("treats identifier-like queries as prefixes", () => {
    expect(ids("k23")).toEqual(["K230001", "K230002"]);
    expect(ids("K#2300 01")).toEqual(["K230001"]);
  });

  it("filters by decision year", () => {
    expect(ids("catheter", { yearFrom: 2021 })).toEqual(["K230001"]);
    expect(ids("catheter", { yearTo: 2000 })).toEqual(["K990001"]);
  });

  it("returns totals beyond the limit", () => {
    const result = search(index, "catheter", {}, 1);
    expect(result.nodes).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("returns nothing for blank queries", () => {
    expect(search(index, "   ")).toEqual({ nodes: [], total: 0 });
  });
});
