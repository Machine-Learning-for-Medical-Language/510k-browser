"""URLs for FDA pages about a submission. Only allowed paths per accessdata robots.txt."""

from fda510k.ids import DEN_NUMBER, K_NUMBER, PMA_NUMBER

ACCESSDATA = "https://www.accessdata.fda.gov"


def record_url(id_: str) -> str | None:
    """The FDA database page for a submission."""
    if K_NUMBER.match(id_):
        return f"{ACCESSDATA}/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID={id_}"
    if DEN_NUMBER.match(id_):
        return f"{ACCESSDATA}/scripts/cdrh/cfdocs/cfpmn/denovo.cfm?ID={id_}"
    if PMA_NUMBER.match(id_):
        return f"{ACCESSDATA}/scripts/cdrh/cfdocs/cfpma/pma.cfm?id={id_}"
    return None


def summary_pdf_url(k_number: str) -> str | None:
    """Conventional location of a 510(k) summary PDF.

    FDA files PDFs by the fiscal year in the K-number: `pdf{year}` with no leading zero
    for 2002 onward (`pdf2/K020001.pdf`, `pdf23/K231234.pdf`), and a flat `pdf/`
    directory before that. This is a convention, not a guarantee; the database
    record page always links to the right file.
    """
    if not K_NUMBER.match(k_number):
        return None
    yy = int(k_number[1:3])
    if 2 <= yy <= 75:
        return f"{ACCESSDATA}/cdrh_docs/pdf{yy}/{k_number}.pdf"
    return f"{ACCESSDATA}/cdrh_docs/pdf/{k_number}.pdf"
