"""openFDA bulk downloads: https://open.fda.gov/data/downloads/

`https://api.fda.gov/download.json` indexes every dataset's zipped JSON partitions.
Each partition zip holds one JSON document shaped `{"meta": ..., "results": [...]}`.
"""

import json
import re
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import polars as pl

DOWNLOAD_INDEX_URL = "https://api.fda.gov/download.json"


@dataclass(frozen=True)
class Partition:
    url: str
    records: int | None


@dataclass(frozen=True)
class Dataset:
    name: str
    export_date: str | None
    total_records: int | None
    partitions: list[Partition]


def fetch_index(client: httpx.Client) -> dict[str, Any]:
    response = client.get(DOWNLOAD_INDEX_URL)
    response.raise_for_status()
    return response.json()


def device_dataset(index: dict[str, Any], name: str) -> Dataset:
    try:
        entry = index["results"]["device"][name]
    except KeyError as exc:
        raise ValueError(f"openFDA download index has no device/{name} dataset") from exc
    partitions = [
        Partition(url=p["file"], records=_as_int(p.get("records"))) for p in entry["partitions"]
    ]
    if not partitions:
        raise ValueError(f"openFDA device/{name} dataset lists no partitions")
    return Dataset(
        name=name,
        export_date=entry.get("export_date"),
        total_records=_as_int(entry.get("total_records")),
        partitions=partitions,
    )


def download_partitions(dataset: Dataset, dest: Path, client: httpx.Client) -> list[Path]:
    """Download each partition zip into `dest`, streaming to disk.

    Files are written under a temporary name and renamed when complete, so an
    interrupted download is never mistaken for a finished one.
    """
    dest.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for partition in dataset.partitions:
        path = dest / Path(httpx.URL(partition.url).path).name
        if not path.exists():
            tmp = path.with_suffix(path.suffix + ".part")
            with client.stream("GET", partition.url) as response:
                response.raise_for_status()
                with tmp.open("wb") as f:
                    for chunk in response.iter_bytes():
                        f.write(chunk)
            tmp.replace(path)
        paths.append(path)
    return paths


def iter_records(zip_paths: list[Path]) -> Iterator[dict[str, Any]]:
    for zip_path in zip_paths:
        with zipfile.ZipFile(zip_path) as zf:
            for member in zf.namelist():
                if not member.endswith(".json"):
                    continue
                with zf.open(member) as f:
                    doc = json.load(f)
                yield from doc["results"]


def parse_510k(records: Iterator[dict[str, Any]]) -> pl.DataFrame:
    rows = [
        {
            "k_number": r.get("k_number"),
            "applicant": r.get("applicant"),
            "device_name": r.get("device_name"),
            "product_code": r.get("product_code"),
            "date_received": _iso_date(r.get("date_received")),
            "decision_date": _iso_date(r.get("decision_date")),
            "decision_code": r.get("decision_code"),
            "decision_description": r.get("decision_description"),
            "clearance_type": r.get("clearance_type"),
            "statement_or_summary": r.get("statement_or_summary"),
            "advisory_committee": r.get("advisory_committee"),
            "advisory_committee_description": r.get("advisory_committee_description"),
            "third_party_flag": r.get("third_party_flag"),
            "expedited_review_flag": r.get("expedited_review_flag"),
            "city": r.get("city"),
            "state": r.get("state"),
            "country_code": r.get("country_code"),
        }
        for r in records
    ]
    return (
        pl.DataFrame(rows, schema=dict.fromkeys(_510K_COLUMNS, pl.String))
        .with_columns(pl.all().str.strip_chars().replace("", None))
        .with_columns(
            pl.col("k_number").str.to_uppercase(),
            pl.col("date_received", "decision_date").str.to_date("%Y-%m-%d", strict=False),
        )
        .sort("k_number")
    )


def parse_classification(records: Iterator[dict[str, Any]]) -> pl.DataFrame:
    rows = [
        {
            "product_code": r.get("product_code"),
            "device_name": r.get("device_name"),
            "device_class": r.get("device_class"),
            "medical_specialty": r.get("medical_specialty"),
            "medical_specialty_description": r.get("medical_specialty_description"),
            "regulation_number": r.get("regulation_number"),
            "definition": r.get("definition"),
        }
        for r in records
    ]
    return (
        pl.DataFrame(rows, schema=dict.fromkeys(_CLASSIFICATION_COLUMNS, pl.String))
        .with_columns(pl.all().str.strip_chars().replace("", None))
        .filter(pl.col("product_code").is_not_null())
        .unique("product_code", keep="first", maintain_order=True)
        .sort("product_code")
    )


_510K_COLUMNS = [
    "k_number",
    "applicant",
    "device_name",
    "product_code",
    "date_received",
    "decision_date",
    "decision_code",
    "decision_description",
    "clearance_type",
    "statement_or_summary",
    "advisory_committee",
    "advisory_committee_description",
    "third_party_flag",
    "expedited_review_flag",
    "city",
    "state",
    "country_code",
]

_CLASSIFICATION_COLUMNS = [
    "product_code",
    "device_name",
    "device_class",
    "medical_specialty",
    "medical_specialty_description",
    "regulation_number",
    "definition",
]

_COMPACT_DATE = re.compile(r"^(\d{4})(\d{2})(\d{2})$")


def _iso_date(value: object) -> str | None:
    """openFDA mixes `YYYY-MM-DD` and `YYYYMMDD` across datasets; normalize to ISO."""
    if not isinstance(value, str) or not value.strip():
        return None
    s = value.strip()
    if m := _COMPACT_DATE.match(s):
        return f"{m[1]}-{m[2]}-{m[3]}"
    return s


def _as_int(value: object) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value)
    return None
