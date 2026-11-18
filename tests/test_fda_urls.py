import pytest

from fda510k.fda_urls import record_url, summary_pdf_url

ALLOWED_PREFIXES = (
    "https://www.accessdata.fda.gov/cdrh_docs/",
    "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/",
    "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/",
)


@pytest.mark.parametrize(
    ("k_number", "expected_dir"),
    [
        ("K231234", "pdf23"),
        ("K081234", "pdf8"),
        ("K021234", "pdf2"),
        ("K011234", "pdf"),
        ("K991234", "pdf"),
        ("K761234", "pdf"),
    ],
)
def test_summary_pdf_url(k_number: str, expected_dir: str) -> None:
    url = summary_pdf_url(k_number)
    assert url == f"https://www.accessdata.fda.gov/cdrh_docs/{expected_dir}/{k_number}.pdf"


def test_summary_pdf_url_only_for_k_numbers() -> None:
    assert summary_pdf_url("DEN200001") is None


@pytest.mark.parametrize("id_", ["K231234", "DEN200001", "P970003"])
def test_urls_stay_on_allowed_paths(id_: str) -> None:
    urls = [record_url(id_), summary_pdf_url(id_)]
    for url in filter(None, urls):
        assert url.startswith(ALLOWED_PREFIXES)


def test_record_url_unknown() -> None:
    assert record_url("X1") is None
