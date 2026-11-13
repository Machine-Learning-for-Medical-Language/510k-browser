import type { Core } from "./data";
import { citationCount } from "./lineage";

export interface SearchIndex {
  core: Core;
  /** Lowercased "name applicant productcode" per node. */
  haystack: string[];
}

export function buildIndex(core: Core): SearchIndex {
  const { search } = core;
  const haystack = search.name.map((name, i) =>
    [
      name,
      search.applicants[search.applicant[i] as number],
      search.product_codes[search.product_code[i] as number],
    ]
      .join(" ")
      .toLowerCase(),
  );
  return { core, haystack };
}

export interface SearchFilters {
  yearFrom?: number;
  yearTo?: number;
}

/**
 * Identifier-like queries (`K23`, `k2312`, `DEN20`) match id prefixes. Anything else
 * must match every whitespace-separated term somewhere in the name, applicant or
 * product code. Results are ordered by exact product-code match, then by how often a
 * device is cited as a predicate, then newest first.
 */
export function search(
  index: SearchIndex,
  query: string,
  filters: SearchFilters = {},
  limit = 100,
): { nodes: number[]; total: number } {
  const { core, haystack } = index;
  const q = query.trim();
  if (!q) return { nodes: [], total: 0 };

  const years = core.search.year;
  const inRange = (node: number) => {
    const year = years[node] ?? 0;
    if (filters.yearFrom && year < filters.yearFrom) return false;
    if (filters.yearTo && year > filters.yearTo) return false;
    return true;
  };

  const matches: number[] = [];
  const idPrefix = q.replace(/[\s#]/g, "").toUpperCase();
  if (/^(K|DEN|P)\d+$/.test(idPrefix)) {
    core.ids.forEach((id, node) => {
      if (id.startsWith(idPrefix) && inRange(node)) matches.push(node);
    });
  } else {
    const terms = q.toLowerCase().split(/\s+/);
    haystack.forEach((text, node) => {
      if (terms.every((t) => text.includes(t)) && inRange(node)) matches.push(node);
    });
  }

  const upper = q.toUpperCase();
  const codes = core.search.product_codes;
  const exactCode = (node: number) =>
    codes[core.search.product_code[node] as number] === upper ? 1 : 0;
  matches.sort(
    (a, b) =>
      exactCode(b) - exactCode(a) ||
      citationCount(core.graph, b) - citationCount(core.graph, a) ||
      (years[b] ?? 0) - (years[a] ?? 0) ||
      a - b,
  );
  return { nodes: matches.slice(0, limit), total: matches.length };
}
