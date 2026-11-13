/** Types and loaders for the static JSON written by `fda510k build-site-data`. */

export interface Graph {
  pred_offsets: number[];
  pred: number[];
  pred_flags: number[];
  desc_offsets: number[];
  desc: number[];
  desc_flags: number[];
}

export interface SearchColumns {
  name: string[];
  applicant: number[];
  applicants: string[];
  product_code: number[];
  product_codes: string[];
  year: number[];
  type: number[];
}

export interface ProductCode {
  name: string | null;
  class: string | null;
  specialty: string | null;
  regulation: string | null;
}

export interface NodeRecord {
  type: "510k" | "denovo" | "pma" | "unknown";
  known: boolean;
  record_url: string | null;
  summary_pdf_url?: string;
  no_predicate_found?: boolean;
  applicant?: string;
  device_name?: string;
  product_code?: string;
  date_received?: string;
  decision_date?: string;
  decision_code?: string;
  decision_description?: string;
  clearance_type?: string;
  statement_or_summary?: string;
  advisory_committee_description?: string;
  third_party_flag?: string;
  expedited_review_flag?: string;
  city?: string;
  state?: string;
  country_code?: string;
}

export interface Meta {
  built_at: string;
  pipeline_version: string;
  sources: { devices_export_date: string | null; classification_export_date: string | null };
  counts: { nodes: number; devices: number; edges: number; shards: number };
  edge_flags: Record<string, number>;
  shards: string[];
}

export const EdgeFlag = {
  SEED_AUTO: 1,
  SEED_MANUAL: 2,
  OVERRIDE: 4,
  PREDICATE_AFTER_DEVICE: 8,
} as const;

/** The pieces most views need together: ids, the graph and the search columns. */
export interface Core {
  ids: string[];
  index: Map<string, number>;
  graph: Graph;
  search: SearchColumns;
}

const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let pending = cache.get(path);
  if (!pending) {
    pending = fetch(`data/${path}`).then((response) => {
      if (!response.ok) throw new Error(`Couldn't load ${path} (HTTP ${response.status}).`);
      return response.json();
    });
    pending.catch(() => cache.delete(path));
    cache.set(path, pending);
  }
  return pending as Promise<T>;
}

export const loadMeta = () => load<Meta>("meta.json");
export const loadProductCodes = () => load<Record<string, ProductCode>>("product_codes.json");

let core: Promise<Core> | undefined;

export function loadCore(): Promise<Core> {
  core ??= Promise.all([
    load<string[]>("ids.json"),
    load<Graph>("graph.json"),
    load<SearchColumns>("search.json"),
  ]).then(([ids, graph, search]) => ({
    ids,
    index: new Map(ids.map((id, i) => [id, i])),
    graph,
    search,
  }));
  core.catch(() => {
    core = undefined;
  });
  return core;
}

/** Mirrors `fda510k.ids.shard_key`. */
export function shardKey(id: string): string | null {
  if (/^K\d{6}$/.test(id)) return id.slice(0, 3);
  if (/^DEN\d{6}$/.test(id)) return "DEN";
  if (/^P\d{6}$/.test(id)) return "P";
  return null;
}

export async function loadNode(id: string): Promise<NodeRecord | null> {
  const key = shardKey(id);
  if (!key) return null;
  try {
    const shard = await load<Record<string, NodeRecord>>(`nodes/${key}.json`);
    return shard[id] ?? null;
  } catch {
    return null;
  }
}

export function normalizeId(raw: string): string | null {
  const s = raw.replace(/[\s#]/g, "").toUpperCase();
  return /^(K\d{6}|DEN\d{6}|P\d{6})$/.test(s) ? s : null;
}
