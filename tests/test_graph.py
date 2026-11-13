import datetime as dt
from pathlib import Path

import polars as pl
import pytest

from fda510k import graph

EDGE_SCHEMA = {"device": pl.String, "predicate": pl.String, "source": pl.String}


def seed_edges(*rows: tuple[str, str]) -> pl.DataFrame:
    return pl.DataFrame(
        [(d, p, "seed_wcedmisten") for d, p in rows], schema=EDGE_SCHEMA, orient="row"
    )


def overrides(*rows: tuple[str, str, str]) -> pl.DataFrame:
    return pl.DataFrame(
        [(d, p, a, "because", "me") for d, p, a in rows],
        schema=dict.fromkeys(graph.OVERRIDE_COLUMNS, pl.String),
        orient="row",
    )


def devices(*rows: tuple[str, str, str]) -> pl.DataFrame:
    return pl.DataFrame(
        [(k, dt.date.fromisoformat(r), dt.date.fromisoformat(d)) for k, r, d in rows],
        schema={"k_number": pl.String, "date_received": pl.Date, "decision_date": pl.Date},
        orient="row",
    )


DEVICES = devices(
    ("K100001", "2010-01-01", "2010-03-01"),
    ("K200001", "2020-01-01", "2020-01-15"),
    ("K200002", "2020-02-01", "2020-04-01"),
)


def test_build_merges_overrides_and_flags() -> None:
    edges, report = graph.build(
        seed_edges(
            ("K200001", "K100001"),
            ("K200001", "K200001"),  # self-loop
            ("K200002", "K100001"),
            ("K200001", "K200002"),  # predicate decided after device received
        ),
        overrides(
            ("K200002", "K100001", "remove"),
            ("K200002", "K200001", "add"),
            ("K200002", "K999999", "remove"),  # matches nothing
        ),
        DEVICES,
    )
    assert edges.rows() == [
        ("K200001", "K100001", ["seed_wcedmisten"], False),
        ("K200001", "K200002", ["seed_wcedmisten"], True),
        ("K200002", "K200001", ["manual_override"], False),
    ]
    assert report.self_loops_dropped == 1
    assert report.overrides_added == 1
    assert report.overrides_removed == 1
    assert report.overrides_unmatched_removals == ["K200002->K999999"]
    assert report.predicate_after_device == 1
    assert report.nodes_in_cycles == 2
    assert report.cycle_sample == [["K200001", "K200002"]]


def test_duplicate_sources_merge() -> None:
    seed = pl.concat(
        [
            seed_edges(("K200001", "K100001")),
            pl.DataFrame(
                [("K200001", "K100001", "seed_wcedmisten_manual")],
                schema=EDGE_SCHEMA,
                orient="row",
            ),
        ]
    )
    edges, report = graph.build(seed, overrides(), DEVICES)
    assert edges["sources"].to_list() == [["seed_wcedmisten", "seed_wcedmisten_manual"]]
    assert report.edges == 1


def test_dangling_predicates_counted() -> None:
    _, report = graph.build(seed_edges(("K200001", "K050505")), overrides(), DEVICES)
    assert report.dangling_predicates == 1


def test_strongly_connected_cycles() -> None:
    pairs = [("a", "b"), ("b", "c"), ("c", "a"), ("c", "d"), ("d", "e"), ("e", "d"), ("f", "a")]
    assert sorted(sorted(c) for c in graph.strongly_connected_cycles(pairs)) == [
        ["a", "b", "c"],
        ["d", "e"],
    ]


def test_cycle_detection_handles_deep_chains() -> None:
    chain = [(f"n{i}", f"n{i + 1}") for i in range(50_000)]
    assert graph.strongly_connected_cycles(chain) == []


def test_load_overrides_missing_file_is_empty(tmp_path: Path) -> None:
    assert graph.load_overrides(tmp_path / "nope.csv").is_empty()


def test_load_overrides_validates(tmp_path: Path) -> None:
    path = tmp_path / "overrides.csv"
    path.write_text(
        "device,predicate,action,reason,author\n"
        "K200001,K100001,add,looked at the PDF,me\n"
        "k200001,K100001,add,lowercase,me\n"
        "K200001,K100001,delete,bad action,me\n"
        "K200001,K100001,remove,,me\n"
        "K200001,K200001,add,self,me\n"
    )
    with pytest.raises(graph.OverrideError) as exc:
        graph.load_overrides(path)
    message = str(exc.value)
    assert "line 2" not in message
    for expected in ("line 3: invalid", "line 4: action", "line 5: reason", "line 6: a device"):
        assert expected in message
