import io
import json
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest

from fda510k.config import Paths

INDEX_URL = "https://api.fda.gov/download.json"
K510_URL = "https://download.open.fda.gov/device/510k/device-510k-0001-of-0001.json.zip"
CLASS_URL = (
    "https://download.open.fda.gov/device/classification/"
    "device-classification-0001-of-0001.json.zip"
)


def device(k_number: str | None, **fields: Any) -> dict[str, Any]:
    record: dict[str, Any] = {
        "k_number": k_number,
        "applicant": "ACME MEDICAL",
        "device_name": f"Device {k_number}",
        "product_code": "DQY",
        "date_received": "2020-01-02",
        "decision_date": "2020-03-04",
        "decision_code": "SESE",
        "decision_description": "Substantially Equivalent",
        "clearance_type": "Traditional",
        "statement_or_summary": "Summary",
        "advisory_committee_description": "Cardiovascular",
        "openfda": {"device_class": "2"},
    }
    record.update(fields)
    return record


def zipped(results: list[dict[str, Any]], member: str = "data.json") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(member, json.dumps({"meta": {}, "results": results}))
    return buf.getvalue()


def download_index(k510_total: int | None, class_total: int | None) -> dict[str, Any]:
    return {
        "results": {
            "device": {
                "510k": {
                    "export_date": "2026-11-01",
                    "total_records": k510_total,
                    "partitions": [{"file": K510_URL, "records": k510_total}],
                },
                "classification": {
                    "export_date": "2026-11-02",
                    "total_records": class_total,
                    "partitions": [{"file": CLASS_URL, "records": class_total}],
                },
            }
        }
    }


MakeClient = Callable[..., httpx.Client]


@pytest.fixture
def make_client() -> MakeClient:
    """An httpx client serving a fake openFDA from in-memory records."""

    def factory(
        devices: list[dict[str, Any]],
        classifications: list[dict[str, Any]] | None = None,
        k510_total: int | None = None,
    ) -> httpx.Client:
        classifications = classifications or [
            {"product_code": "DQY", "device_name": "Catheter", "device_class": "2"}
        ]
        total = len(devices) if k510_total is None else k510_total
        routes = {
            INDEX_URL: json.dumps(download_index(total, len(classifications))).encode(),
            K510_URL: zipped(devices),
            CLASS_URL: zipped(classifications),
        }

        def handler(request: httpx.Request) -> httpx.Response:
            body = routes.get(str(request.url))
            return httpx.Response(200, content=body) if body else httpx.Response(404)

        return httpx.Client(transport=httpx.MockTransport(handler))

    return factory


@pytest.fixture
def paths(tmp_path: Path) -> Paths:
    return Paths(tmp_path)
