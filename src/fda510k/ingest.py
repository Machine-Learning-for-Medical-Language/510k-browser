"""Stage `ingest`: download openFDA device metadata into `build/`."""

import json
from dataclasses import asdict, dataclass

import httpx
import polars as pl

from fda510k.config import USER_AGENT, Paths
from fda510k.ids import DEN_NUMBER, K_NUMBER
from fda510k.sources import openfda

MAX_INVALID_FRACTION = 0.01
MAX_COUNT_MISMATCH_FRACTION = 0.01


class IngestError(Exception):
    pass


@dataclass(frozen=True)
class IngestSummary:
    devices_export_date: str | None
    classification_export_date: str | None
    devices: int
    dropped_invalid_ids: int
    dropped_duplicates: int
    product_codes: int


def run(paths: Paths, client: httpx.Client | None = None) -> IngestSummary:
    owns_client = client is None
    client = client or httpx.Client(
        headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=120
    )
    try:
        index = openfda.fetch_index(client)
        k510 = openfda.device_dataset(index, "510k")
        classification = openfda.device_dataset(index, "classification")
        k510_zips = openfda.download_partitions(k510, paths.downloads / "510k", client)
        class_zips = openfda.download_partitions(
            classification, paths.downloads / "classification", client
        )
    finally:
        if owns_client:
            client.close()

    raw = openfda.parse_510k(openfda.iter_records(k510_zips))
    devices, dropped_invalid, dropped_dupes = validate_devices(raw, k510.total_records)
    product_codes = openfda.parse_classification(openfda.iter_records(class_zips))

    paths.build.mkdir(parents=True, exist_ok=True)
    devices.write_parquet(paths.devices)
    product_codes.write_parquet(paths.product_codes)

    summary = IngestSummary(
        devices_export_date=k510.export_date,
        classification_export_date=classification.export_date,
        devices=devices.height,
        dropped_invalid_ids=dropped_invalid,
        dropped_duplicates=dropped_dupes,
        product_codes=product_codes.height,
    )
    paths.ingest_meta.write_text(json.dumps(asdict(summary), indent=2, sort_keys=True) + "\n")
    return summary


def validate_devices(
    raw: pl.DataFrame, expected_total: int | None
) -> tuple[pl.DataFrame, int, int]:
    """Drop unusable rows, failing loudly if the source looks broken rather than noisy.

    Returns (devices, dropped_invalid_ids, dropped_duplicates).
    """
    if raw.is_empty():
        raise IngestError("openFDA 510(k) dataset parsed to zero records")
    if expected_total is not None:
        mismatch = abs(raw.height - expected_total) / expected_total
        if mismatch > MAX_COUNT_MISMATCH_FRACTION:
            raise IngestError(f"parsed {raw.height} records but the index reports {expected_total}")

    valid_id = pl.col("k_number").str.contains(K_NUMBER.pattern) | pl.col("k_number").str.contains(
        DEN_NUMBER.pattern
    )
    valid = raw.filter(valid_id.fill_null(False))
    dropped_invalid = raw.height - valid.height
    if dropped_invalid / raw.height > MAX_INVALID_FRACTION:
        raise IngestError(f"{dropped_invalid} of {raw.height} records have invalid identifiers")

    deduped = valid.unique("k_number", keep="first", maintain_order=True).sort("k_number")
    return deduped, dropped_invalid, valid.height - deduped.height
