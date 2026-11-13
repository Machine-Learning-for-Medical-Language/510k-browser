import datetime as dt
import json
from pathlib import Path
from typing import Any

import polars as pl
import pytest

from fda510k import site_data
from fda510k.site_data import EdgeFlag


def device_frame(*k_numbers: str) -> pl.DataFrame:
    return pl.DataFrame(
        {
            "k_number": list(k_numbers),
            "applicant": ["ACME"] * len(k_numbers),
            "device_name": [f"name {k}" for k in k_numbers],
            "product_code": ["DQY"] * len(k_numbers),
            "decision_date": [dt.date(2020, 3, 4)] * len(k_numbers),
            "statement_or_summary": ["Summary"] * (len(k_numbers) - 1) + ["Statement"],
        }
    )


def build(tmp_path: Path, **overrides: Any) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "devices": device_frame("K200001", "K200002", "K990001"),
        "product_codes": pl.DataFrame(
            {
                "product_code": ["DQY"],
                "device_name": ["Catheter"],
                "device_class": ["2"],
                "medical_specialty_description": ["Cardiovascular"],
                "regulation_number": ["870.1250"],
            }
        ),
        "edges": pl.DataFrame(
            {
                "device": ["K200001", "K200002", "K200002"],
                "predicate": ["K990001", "K990001", "DEN180001"],
                "sources": [["seed_wcedmisten"], ["seed_wcedmisten_manual"], ["manual_override"]],
                "predicate_after_device": [False, True, False],
            }
        ),
        "no_predicate_found": {"K990001"},
        "ingest_meta": {"devices_export_date": "2026-11-01"},
        "graph_report": {"edges": 3},
        "built_at": dt.datetime(2026, 11, 13, tzinfo=dt.UTC),
    }
    kwargs.update(overrides)
    return site_data.build(tmp_path, **kwargs)


def load(tmp_path: Path, name: str) -> Any:
    return json.loads((tmp_path / name).read_text())


def test_ids_include_dangling_predicates(tmp_path: Path) -> None:
    build(tmp_path)
    assert load(tmp_path, "ids.json") == ["DEN180001", "K200001", "K200002", "K990001"]


def test_graph_csr_is_consistent(tmp_path: Path) -> None:
    build(tmp_path)
    ids: list[str] = load(tmp_path, "ids.json")
    g = load(tmp_path, "graph.json")
    i = {id_: n for n, id_ in enumerate(ids)}

    def neighbors(kind: str, id_: str) -> list[tuple[str, int]]:
        lo, hi = g[f"{kind}_offsets"][i[id_]], g[f"{kind}_offsets"][i[id_] + 1]
        return [(ids[t], f) for t, f in zip(g[kind][lo:hi], g[f"{kind}_flags"][lo:hi], strict=True)]

    assert neighbors("pred", "K200002") == [
        ("DEN180001", EdgeFlag.OVERRIDE),
        ("K990001", EdgeFlag.SEED_MANUAL | EdgeFlag.PREDICATE_AFTER_DEVICE),
    ]
    assert neighbors("desc", "K990001") == [
        ("K200001", EdgeFlag.SEED_AUTO),
        ("K200002", EdgeFlag.SEED_MANUAL | EdgeFlag.PREDICATE_AFTER_DEVICE),
    ]
    assert neighbors("pred", "K990001") == []
    assert len(g["pred_offsets"]) == len(g["desc_offsets"]) == len(ids) + 1


def test_search_is_columnar_and_dictionary_encoded(tmp_path: Path) -> None:
    build(tmp_path)
    s = load(tmp_path, "search.json")
    assert s["name"] == ["", "name K200001", "name K200002", "name K990001"]
    assert [s["applicants"][a] for a in s["applicant"]] == ["", "ACME", "ACME", "ACME"]
    assert s["year"] == [0, 2020, 2020, 2020]
    assert s["type"] == [1, 0, 0, 0]


def test_node_shards(tmp_path: Path) -> None:
    meta = build(tmp_path)
    assert meta["shards"] == ["DEN", "K20", "K99"]
    k20 = load(tmp_path, "nodes/K20.json")
    record = k20["K200001"]
    assert record["decision_date"] == "2020-03-04"
    assert record["summary_pdf_url"].endswith("/cdrh_docs/pdf20/K200001.pdf")
    assert record["record_url"].endswith("pmn.cfm?ID=K200001")
    k99 = load(tmp_path, "nodes/K99.json")["K990001"]
    assert k99["no_predicate_found"] is True
    assert "summary_pdf_url" not in k99
    den = load(tmp_path, "nodes/DEN.json")["DEN180001"]
    assert den == {"type": "denovo", "known": False, "record_url": den["record_url"]}


def test_stale_shards_removed(tmp_path: Path) -> None:
    (tmp_path / "nodes").mkdir()
    (tmp_path / "nodes" / "K77.json").write_text("{}")
    build(tmp_path)
    assert not (tmp_path / "nodes" / "K77.json").exists()


def test_meta(tmp_path: Path) -> None:
    build(tmp_path)
    meta = load(tmp_path, "meta.json")
    assert meta["built_at"] == "2026-11-13T00:00:00+00:00"
    assert meta["counts"] == {"nodes": 4, "devices": 3, "edges": 3, "shards": 3}
    assert meta["edge_flags"]["PREDICATE_AFTER_DEVICE"] == 8
    assert set(meta["file_bytes"]) >= {"ids.json", "graph.json", "nodes/K20.json"}


def test_size_budget(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(site_data, "MAX_FILE_BYTES", 10)
    with pytest.raises(site_data.SizeBudgetError, match=r"ids\.json"):
        build(tmp_path)
