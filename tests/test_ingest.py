import json

import polars as pl
import pytest

from fda510k import ingest
from fda510k.config import Paths
from tests.conftest import MakeClient, device


def test_run_writes_outputs(paths: Paths, make_client: MakeClient) -> None:
    client = make_client([device("K200001"), device("DEN200002"), device("K200001")])
    summary = ingest.run(paths, client)

    assert summary.devices == 2
    assert summary.dropped_duplicates == 1
    assert summary.devices_export_date == "2026-11-01"
    assert pl.read_parquet(paths.devices)["k_number"].to_list() == ["DEN200002", "K200001"]
    assert pl.read_parquet(paths.product_codes)["product_code"].to_list() == ["DQY"]
    assert json.loads(paths.ingest_meta.read_text())["devices"] == 2


def test_rejects_count_mismatch(paths: Paths, make_client: MakeClient) -> None:
    client = make_client([device("K200001")], k510_total=500)
    with pytest.raises(ingest.IngestError, match="index reports 500"):
        ingest.run(paths, client)


def test_rejects_mostly_invalid_ids(paths: Paths, make_client: MakeClient) -> None:
    client = make_client([device("K200001"), device("garbage"), device(None)])
    with pytest.raises(ingest.IngestError, match="invalid identifiers"):
        ingest.run(paths, client)


def test_tolerates_rare_invalid_ids() -> None:
    raw = pl.DataFrame(
        {"k_number": ["bad"] + [f"K{i:06d}" for i in range(200)]},
        schema={"k_number": pl.String},
    )
    devices, dropped, dupes = ingest.validate_devices(raw, expected_total=None)
    assert (devices.height, dropped, dupes) == (200, 1, 0)


def test_rejects_empty_dataset() -> None:
    with pytest.raises(ingest.IngestError, match="zero records"):
        ingest.validate_devices(pl.DataFrame(schema={"k_number": pl.String}), None)
