import { describe, expect, it } from "vitest";
import { parseHash, searchHref } from "./router";

describe("parseHash", () => {
  it.each([
    ["", { view: "home" }],
    ["#/", { view: "home" }],
    ["#/device/k123456", { view: "device", id: "K123456" }],
    ["#/about", { view: "about" }],
    ["#/search?q=dqy&from=2010", { view: "search", q: "dqy", yearFrom: 2010, yearTo: undefined }],
    ["#/search?q=x&from=nope", { view: "search", q: "x", yearFrom: undefined, yearTo: undefined }],
    ["#/nowhere", { view: "missing", hash: "#/nowhere" }],
  ])("%s", (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected);
  });

  it("round-trips search links", () => {
    expect(parseHash(searchHref("hip implant", 2000, 2010))).toEqual({
      view: "search",
      q: "hip implant",
      yearFrom: 2000,
      yearTo: 2010,
    });
  });
});
