"""Stage `build-site-data`: emit the static JSON files the frontend loads.

Layout (all under the output directory):
- `meta.json`: build info, source export dates, counts, graph report.
- `ids.json`: node identifiers; a node's position here is its integer id everywhere else.
- `graph.json`: CSR adjacency in both directions with per-edge flags (see EdgeFlag).
- `search.json`: columnar per-node fields for client-side search.
- `product_codes.json`: product code -> classification details.
- `nodes/<shard>.json`: full per-node records, sharded by `ids.shard_key`.
"""

import json
from collections import defaultdict
from datetime import UTC, date, datetime
from enum import IntFlag
from pathlib import Path
from typing import Any

import polars as pl

from fda510k.config import PIPELINE_VERSION, Paths
from fda510k.fda_urls import record_url, summary_pdf_url
from fda510k.graph import SOURCE_OVERRIDE
from fda510k.ids import NodeType, node_type, shard_key
from fda510k.seed import SOURCE_AUTO, SOURCE_MANUAL

MAX_FILE_BYTES = 50 * 1024 * 1024

NODE_TYPE_CODES: dict[NodeType, int] = {
    NodeType.K510: 0,
    NodeType.DENOVO: 1,
    NodeType.PMA: 2,
    NodeType.UNKNOWN: 3,
}

NODE_FIELDS = [
    "applicant",
    "device_name",
    "product_code",
    "date_received",
    "decision_date",
    "decision_code",
    "decision_description",
    "clearance_type",
    "statement_or_summary",
    "advisory_committee_description",
    "third_party_flag",
    "expedited_review_flag",
    "city",
    "state",
    "country_code",
]


class EdgeFlag(IntFlag):
    SEED_AUTO = 1
    SEED_MANUAL = 2
    OVERRIDE = 4
    PREDICATE_AFTER_DEVICE = 8


_SOURCE_FLAGS = {
    SOURCE_AUTO: EdgeFlag.SEED_AUTO,
    SOURCE_MANUAL: EdgeFlag.SEED_MANUAL,
    SOURCE_OVERRIDE: EdgeFlag.OVERRIDE,
}


class SizeBudgetError(Exception):
    pass


def run(paths: Paths, out: Path | None = None) -> dict[str, Any]:
    out = out or paths.site_data
    devices = pl.read_parquet(paths.devices)
    product_codes = pl.read_parquet(paths.product_codes)
    edges = pl.read_parquet(paths.graph_edges)
    no_predicate = set(pl.read_csv(paths.seed_no_predicate)["k_number"].to_list())
    ingest_meta = json.loads(paths.ingest_meta.read_text())
    graph_report = json.loads(paths.graph_report.read_text())
    return build(
        out,
        devices=devices,
        product_codes=product_codes,
        edges=edges,
        no_predicate_found=no_predicate,
        ingest_meta=ingest_meta,
        graph_report=graph_report,
    )


def build(
    out: Path,
    *,
    devices: pl.DataFrame,
    product_codes: pl.DataFrame,
    edges: pl.DataFrame,
    no_predicate_found: set[str],
    ingest_meta: dict[str, Any],
    graph_report: dict[str, Any],
    built_at: datetime | None = None,
) -> dict[str, Any]:
    out.mkdir(parents=True, exist_ok=True)
    (out / "nodes").mkdir(exist_ok=True)
    for stale in (out / "nodes").glob("*.json"):
        stale.unlink()

    device_rows = {r["k_number"]: r for r in devices.iter_rows(named=True)}
    endpoints = set(edges["device"].to_list()) | set(edges["predicate"].to_list())
    ids = sorted(set(device_rows) | endpoints)
    index = {id_: i for i, id_ in enumerate(ids)}

    files: dict[str, Any] = {
        "ids.json": ids,
        "graph.json": _graph(edges, index, len(ids)),
        "search.json": _search(ids, device_rows),
        "product_codes.json": _product_codes(product_codes),
    }
    shards: dict[str, dict[str, Any]] = defaultdict(dict)
    for id_ in ids:
        shards[shard_key(id_)][id_] = _node_record(id_, device_rows.get(id_), no_predicate_found)
    for key, records in shards.items():
        files[f"nodes/{key}.json"] = records

    sizes = {name: _write_json(out / name, payload) for name, payload in files.items()}
    meta = {
        "built_at": (built_at or datetime.now(UTC)).isoformat(timespec="seconds"),
        "pipeline_version": PIPELINE_VERSION,
        "sources": ingest_meta,
        "counts": {
            "nodes": len(ids),
            "devices": len(device_rows),
            "edges": edges.height,
            "shards": len(shards),
        },
        "graph_report": graph_report,
        "edge_flags": {flag.name: flag.value for flag in EdgeFlag},
        "node_types": {t.value: code for t, code in NODE_TYPE_CODES.items()},
        "shards": sorted(shards),
        "file_bytes": dict(sorted(sizes.items())),
    }
    _write_json(out / "meta.json", meta, indent=2)

    too_big = {name: size for name, size in sizes.items() if size > MAX_FILE_BYTES}
    if too_big:
        raise SizeBudgetError(f"files over {MAX_FILE_BYTES} bytes: {too_big}")
    return meta


def _graph(edges: pl.DataFrame, index: dict[str, int], n: int) -> dict[str, list[int]]:
    preds: list[list[tuple[int, int]]] = [[] for _ in range(n)]
    descs: list[list[tuple[int, int]]] = [[] for _ in range(n)]
    for device, predicate, sources, after in edges.select(
        "device", "predicate", "sources", "predicate_after_device"
    ).iter_rows():
        flags = EdgeFlag(0)
        for source in sources:
            flags |= _SOURCE_FLAGS.get(source, EdgeFlag(0))
        if after:
            flags |= EdgeFlag.PREDICATE_AFTER_DEVICE
        d, p = index[device], index[predicate]
        preds[d].append((p, int(flags)))
        descs[p].append((d, int(flags)))

    def csr(adjacency: list[list[tuple[int, int]]]) -> tuple[list[int], list[int], list[int]]:
        offsets, targets, flags = [0], [], []
        for neighbors in adjacency:
            for target, flag in sorted(neighbors):
                targets.append(target)
                flags.append(flag)
            offsets.append(len(targets))
        return offsets, targets, flags

    pred_offsets, pred_targets, pred_flags = csr(preds)
    desc_offsets, desc_targets, desc_flags = csr(descs)
    return {
        "pred_offsets": pred_offsets,
        "pred": pred_targets,
        "pred_flags": pred_flags,
        "desc_offsets": desc_offsets,
        "desc": desc_targets,
        "desc_flags": desc_flags,
    }


def _search(ids: list[str], device_rows: dict[str, dict[str, Any]]) -> dict[str, list[Any]]:
    """Columnar search fields; applicants and product codes are dictionary-encoded."""
    applicants: dict[str, int] = {}
    codes: dict[str, int] = {}
    names: list[str] = []
    applicant_idx: list[int] = []
    code_idx: list[int] = []
    years: list[int] = []
    types: list[int] = []
    for id_ in ids:
        row = device_rows.get(id_) or {}
        names.append(row.get("device_name") or "")
        applicant_idx.append(applicants.setdefault(row.get("applicant") or "", len(applicants)))
        code_idx.append(codes.setdefault(row.get("product_code") or "", len(codes)))
        decided: date | None = row.get("decision_date")
        years.append(decided.year if decided else 0)
        types.append(NODE_TYPE_CODES[node_type(id_)])
    return {
        "name": names,
        "applicant": applicant_idx,
        "applicants": list(applicants),
        "product_code": code_idx,
        "product_codes": list(codes),
        "year": years,
        "type": types,
    }


def _product_codes(df: pl.DataFrame) -> dict[str, dict[str, str | None]]:
    return {
        row["product_code"]: {
            "name": row["device_name"],
            "class": row["device_class"],
            "specialty": row["medical_specialty_description"],
            "regulation": row["regulation_number"],
        }
        for row in df.iter_rows(named=True)
    }


def _node_record(
    id_: str, row: dict[str, Any] | None, no_predicate_found: set[str]
) -> dict[str, Any]:
    record: dict[str, Any] = {"type": node_type(id_).value, "known": row is not None}
    if row is not None:
        for name in NODE_FIELDS:
            value = row.get(name)
            if value is not None:
                record[name] = value.isoformat() if isinstance(value, date) else value
    record["record_url"] = record_url(id_)
    if row is not None and row.get("statement_or_summary") == "Summary":
        record["summary_pdf_url"] = summary_pdf_url(id_)
    if id_ in no_predicate_found:
        record["no_predicate_found"] = True
    return record


def _write_json(path: Path, payload: Any, indent: int | None = None) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    separators = (",", ": ") if indent else (",", ":")
    text = json.dumps(payload, indent=indent, separators=separators, sort_keys=indent is not None)
    path.write_text(text + "\n")
    return path.stat().st_size
