"""Stage `graph`: merge edge sources and manual overrides into the predicate graph.

Edges point from a device to a predicate it cited (`device -> predicate`).
"""

import json
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from pathlib import Path

import polars as pl

from fda510k.config import Paths
from fda510k.ids import normalize_id

SOURCE_OVERRIDE = "manual_override"
OVERRIDE_COLUMNS = ["device", "predicate", "action", "reason", "author"]
OVERRIDE_ACTIONS = {"add", "remove"}
REPORT_SAMPLE_SIZE = 20


class OverrideError(ValueError):
    pass


@dataclass
class GraphReport:
    edges: int = 0
    devices_with_predicates: int = 0
    self_loops_dropped: int = 0
    overrides_added: int = 0
    overrides_removed: int = 0
    overrides_unmatched_removals: list[str] = field(default_factory=list)
    predicate_after_device: int = 0
    dangling_predicates: int = 0
    nodes_in_cycles: int = 0
    cycle_sample: list[list[str]] = field(default_factory=list)


def run(paths: Paths) -> GraphReport:
    seed = pl.read_csv(paths.seed_edges, schema=_EDGE_SCHEMA)
    overrides = load_overrides(paths.manual_overrides)
    devices = pl.read_parquet(paths.devices, columns=["k_number", "date_received", "decision_date"])
    edges, report = build(seed, overrides, devices)
    paths.build.mkdir(parents=True, exist_ok=True)
    edges.write_parquet(paths.graph_edges)
    paths.graph_report.write_text(json.dumps(asdict(report), indent=2, sort_keys=True) + "\n")
    return report


def load_overrides(path: Path) -> pl.DataFrame:
    if not path.exists():
        return pl.DataFrame(schema=dict.fromkeys(OVERRIDE_COLUMNS, pl.String))
    df = pl.read_csv(path, schema=dict.fromkeys(OVERRIDE_COLUMNS, pl.String))
    errors: list[str] = []
    for i, row in enumerate(df.iter_rows(named=True), start=2):
        device, predicate = row["device"] or "", row["predicate"] or ""
        if normalize_id(device) != device or normalize_id(predicate) != predicate:
            errors.append(f"line {i}: invalid identifier(s) {device!r}, {predicate!r}")
        if row["action"] not in OVERRIDE_ACTIONS:
            errors.append(f"line {i}: action must be one of {sorted(OVERRIDE_ACTIONS)}")
        if not (row["reason"] or "").strip():
            errors.append(f"line {i}: reason is required")
        if device and device == predicate:
            errors.append(f"line {i}: a device cannot be its own predicate")
    if errors:
        raise OverrideError(f"{path}:\n" + "\n".join(errors))
    return df


def build(
    seed: pl.DataFrame, overrides: pl.DataFrame, devices: pl.DataFrame
) -> tuple[pl.DataFrame, GraphReport]:
    report = GraphReport()

    self_loop = pl.col("device") == pl.col("predicate")
    report.self_loops_dropped = seed.filter(self_loop).select("device").unique().height
    edges = seed.filter(~self_loop)

    removals = overrides.filter(pl.col("action") == "remove").select("device", "predicate")
    matched = removals.join(edges, on=["device", "predicate"], how="semi")
    report.overrides_removed = matched.height
    report.overrides_unmatched_removals = sorted(
        f"{d}->{p}"
        for d, p in removals.join(edges, on=["device", "predicate"], how="anti").iter_rows()
    )
    edges = edges.join(removals, on=["device", "predicate"], how="anti")

    additions = (
        overrides.filter(pl.col("action") == "add")
        .select("device", "predicate")
        .with_columns(source=pl.lit(SOURCE_OVERRIDE))
    )
    report.overrides_added = additions.height
    edges = pl.concat([edges, additions])

    edges = (
        edges.group_by("device", "predicate")
        .agg(pl.col("source").unique().sort().alias("sources"))
        .sort("device", "predicate")
    )

    received = devices.select(pl.col("k_number").alias("device"), "date_received")
    decided = devices.select(pl.col("k_number").alias("predicate"), "decision_date")
    edges = (
        edges.join(received, on="device", how="left", maintain_order="left")
        .join(decided, on="predicate", how="left", maintain_order="left")
        .with_columns(
            predicate_after_device=(pl.col("decision_date") > pl.col("date_received")).fill_null(
                False
            )
        )
        .select("device", "predicate", "sources", "predicate_after_device")
        .sort("device", "predicate")
    )

    known = set(devices["k_number"].to_list())
    report.edges = edges.height
    report.devices_with_predicates = edges["device"].n_unique()
    report.predicate_after_device = int(edges["predicate_after_device"].sum())
    report.dangling_predicates = len(set(edges["predicate"].to_list()) - known)

    cycles = strongly_connected_cycles(edges.select("device", "predicate").iter_rows())
    report.nodes_in_cycles = sum(len(c) for c in cycles)
    report.cycle_sample = [sorted(c) for c in cycles[:REPORT_SAMPLE_SIZE]]
    return edges, report


def strongly_connected_cycles(pairs: Iterable[tuple[str, str]]) -> list[list[str]]:
    """Strongly connected components with more than one node (Tarjan, iterative).

    Predicates should always predate the device citing them, so any cycle points to an
    extraction error worth reviewing.
    """
    graph: dict[str, list[str]] = defaultdict(list)
    for src, dst in pairs:
        graph[src].append(dst)
        graph.setdefault(dst, [])

    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    components: list[list[str]] = []
    counter = 0

    for root in graph:
        if root in index:
            continue
        work: list[tuple[str, int]] = [(root, 0)]
        while work:
            node, child_i = work.pop()
            if child_i == 0:
                index[node] = low[node] = counter
                counter += 1
                stack.append(node)
                on_stack.add(node)
            children = graph[node]
            if child_i < len(children):
                work.append((node, child_i + 1))
                child = children[child_i]
                if child not in index:
                    work.append((child, 0))
                elif child in on_stack:
                    low[node] = min(low[node], index[child])
                continue
            if low[node] == index[node]:
                component: list[str] = []
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    component.append(member)
                    if member == node:
                        break
                if len(component) > 1:
                    components.append(component)
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
    components.sort(key=lambda c: (-len(c), min(c)))
    return components


_EDGE_SCHEMA = {"device": pl.String, "predicate": pl.String, "source": pl.String}
