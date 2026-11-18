import datetime as dt
from pathlib import Path

import pytest

from fda510k.sources import openfda
from tests.conftest import K510_URL, MakeClient, device, download_index, zipped


def test_parse_510k_normalizes_fields() -> None:
    df = openfda.parse_510k(
        iter(
            [
                device("k200002 ", date_received="20200105", applicant="  "),
                device("K200001", decision_date=""),
            ]
        )
    )
    assert df["k_number"].to_list() == ["K200001", "K200002"]
    first, second = df.row(0, named=True), df.row(1, named=True)
    assert first["decision_date"] is None
    assert second["date_received"] == dt.date(2020, 1, 5)
    assert second["applicant"] is None


def test_parse_510k_tolerates_missing_keys() -> None:
    df = openfda.parse_510k(iter([{"k_number": "K200001"}]))
    assert df.height == 1
    assert df["device_name"].to_list() == [None]


def test_parse_classification_dedupes_and_drops_null_codes() -> None:
    df = openfda.parse_classification(
        iter(
            [
                {"product_code": "DQY", "device_name": "first"},
                {"product_code": "DQY", "device_name": "second"},
                {"product_code": None, "device_name": "orphan"},
                {"product_code": "ABC", "device_name": "other"},
            ]
        )
    )
    assert df.select("product_code", "device_name").rows() == [
        ("ABC", "other"),
        ("DQY", "first"),
    ]


def test_device_dataset_errors_on_missing_dataset() -> None:
    with pytest.raises(ValueError, match="no device/pma dataset"):
        openfda.device_dataset(download_index(1, 1), "pma")


def test_download_and_iter_records(tmp_path: Path, make_client: MakeClient) -> None:
    client = make_client([device("K200001"), device("K200002")])
    dataset = openfda.device_dataset(openfda.fetch_index(client), "510k")
    assert dataset.export_date == "2026-11-01"

    paths = openfda.download_partitions(dataset, tmp_path, client)
    assert [p.name for p in paths] == [Path(K510_URL).name]
    assert not list(tmp_path.glob("*.part"))
    assert [r["k_number"] for r in openfda.iter_records(paths)] == ["K200001", "K200002"]


def test_download_skips_existing_files(tmp_path: Path, make_client: MakeClient) -> None:
    client = make_client([device("K200001")])
    dataset = openfda.device_dataset(openfda.fetch_index(client), "510k")
    existing = tmp_path / Path(K510_URL).name
    existing.write_bytes(zipped([device("K999999")]))

    paths = openfda.download_partitions(dataset, tmp_path, client)
    assert [r["k_number"] for r in openfda.iter_records(paths)] == ["K999999"]
