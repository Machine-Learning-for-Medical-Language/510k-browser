import type { Core, Graph } from "./data";

/** Build a Core from `device -> predicate` pairs, mirroring `fda510k.site_data`. */
export function makeCore(
  nodes: { id: string; name?: string; applicant?: string; code?: string; year?: number }[],
  edges: [string, string, number?][],
): Core {
  const ids = nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const preds: [number, number][][] = ids.map(() => []);
  const descs: [number, number][][] = ids.map(() => []);
  for (const [device, predicate, flags = 1] of edges) {
    const d = index.get(device) as number;
    const p = index.get(predicate) as number;
    preds[d]?.push([p, flags]);
    descs[p]?.push([d, flags]);
  }
  const csr = (adj: [number, number][][]) => {
    const offsets = [0];
    const targets: number[] = [];
    const flags: number[] = [];
    for (const list of adj) {
      for (const [t, f] of [...list].sort((a, b) => a[0] - b[0])) {
        targets.push(t);
        flags.push(f);
      }
      offsets.push(targets.length);
    }
    return { offsets, targets, flags };
  };
  const p = csr(preds);
  const d = csr(descs);
  const graph: Graph = {
    pred_offsets: p.offsets,
    pred: p.targets,
    pred_flags: p.flags,
    desc_offsets: d.offsets,
    desc: d.targets,
    desc_flags: d.flags,
  };
  const applicants = [...new Set(nodes.map((n) => n.applicant ?? ""))];
  const codes = [...new Set(nodes.map((n) => n.code ?? ""))];
  return {
    ids,
    index,
    graph,
    search: {
      name: nodes.map((n) => n.name ?? ""),
      applicant: nodes.map((n) => applicants.indexOf(n.applicant ?? "")),
      applicants,
      product_code: nodes.map((n) => codes.indexOf(n.code ?? "")),
      product_codes: codes,
      year: nodes.map((n) => n.year ?? 0),
      type: nodes.map(() => 0),
    },
  };
}
