import type { Graph } from "./data";

export interface LineageEdge {
  /** The citing device. */
  device: number;
  /** The predicate it cited. */
  predicate: number;
  flags: number;
}

export interface Lineage {
  /** Node id -> generation: negative for ancestors, 0 for the focal device, positive for descendants. */
  generation: Map<number, number>;
  edges: LineageEdge[];
  /** True when the node cap cut the traversal short. */
  truncated: boolean;
}

export function predicates(g: Graph, node: number): number[] {
  return g.pred.slice(g.pred_offsets[node], g.pred_offsets[node + 1]);
}

export function predicateFlags(g: Graph, node: number): number[] {
  return g.pred_flags.slice(g.pred_offsets[node], g.pred_offsets[node + 1]);
}

export function descendants(g: Graph, node: number): number[] {
  return g.desc.slice(g.desc_offsets[node], g.desc_offsets[node + 1]);
}

export function descendantFlags(g: Graph, node: number): number[] {
  return g.desc_flags.slice(g.desc_offsets[node], g.desc_offsets[node + 1]);
}

export function citationCount(g: Graph, node: number): number {
  return (g.desc_offsets[node + 1] ?? 0) - (g.desc_offsets[node] ?? 0);
}

/**
 * Breadth-first ancestry (`up` generations) and descendants (`down` generations) of
 * `focal`. Ancestors are explored first so a capped view still shows where a device
 * came from. Only edges along the explored direction are kept, which keeps the
 * picture readable: siblings and cousins are left out.
 */
export function lineage(
  g: Graph,
  focal: number,
  up: number,
  down: number,
  maxNodes: number,
): Lineage {
  const generation = new Map<number, number>([[focal, 0]]);
  const edges: LineageEdge[] = [];
  const seenEdges = new Set<string>();
  let truncated = false;

  const walk = (depth: number, sign: -1 | 1) => {
    let frontier = [focal];
    for (let gen = 1; gen <= depth && frontier.length > 0; gen++) {
      const next: number[] = [];
      for (const node of frontier) {
        const lo = (sign < 0 ? g.pred_offsets : g.desc_offsets)[node] ?? 0;
        const hi = (sign < 0 ? g.pred_offsets : g.desc_offsets)[node + 1] ?? 0;
        for (let i = lo; i < hi; i++) {
          const other = (sign < 0 ? g.pred : g.desc)[i] as number;
          const flags = (sign < 0 ? g.pred_flags : g.desc_flags)[i] as number;
          if (!generation.has(other)) {
            if (generation.size >= maxNodes) {
              truncated = true;
              continue;
            }
            generation.set(other, sign * gen);
            next.push(other);
          }
          const edge =
            sign < 0
              ? { device: node, predicate: other, flags }
              : { device: other, predicate: node, flags };
          const key = `${edge.device}>${edge.predicate}`;
          if (!seenEdges.has(key)) {
            seenEdges.add(key);
            edges.push(edge);
          }
        }
      }
      frontier = next;
    }
  };

  walk(up, -1);
  walk(down, 1);
  return { generation, edges, truncated };
}

/** The `n` most-cited nodes, most-cited first (ties: lower id first). */
export function mostCited(g: Graph, n: number): number[] {
  const nodes = g.desc_offsets.length - 1;
  const top: number[] = [];
  for (let node = 0; node < nodes; node++) {
    const count = citationCount(g, node);
    if (top.length < n || count > citationCount(g, top[top.length - 1] as number)) {
      let i = top.length;
      while (i > 0 && citationCount(g, top[i - 1] as number) < count) i--;
      top.splice(i, 0, node);
      if (top.length > n) top.pop();
    }
  }
  return top;
}

/** Latest decision year among devices with at least one predicate link. */
export function predicateCoverageYear(g: Graph, years: number[]): number {
  let latest = 0;
  for (let node = 0; node < years.length; node++) {
    if ((g.pred_offsets[node + 1] ?? 0) > (g.pred_offsets[node] ?? 0)) {
      latest = Math.max(latest, years[node] ?? 0);
    }
  }
  return latest;
}
