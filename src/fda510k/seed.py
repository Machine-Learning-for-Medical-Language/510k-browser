"""Stage `import-seed`: one-time import of predicate edges from wcedmisten/fda-510k-analysis.

Upstream (AGPL-3.0) code is not copied; only its extracted data files are read:
- `scripts/predicates.csv` (`device,predicate`): the final edge export, after upstream
  merged manual links and ran its cleanup pass. This is the edge set.
- `scripts/manually_added_links.csv` (`device,predicate`): hand-entered links, used to
  tag which edges were entered by hand. A predicate of `S` means "reviewed by hand, no
  predicate could be identified".
"""

import csv
import subprocess
from dataclasses import dataclass
from pathlib import Path

import polars as pl

from fda510k.config import Paths
from fda510k.ids import normalize_id

UPSTREAM_REPO = "https://github.com/wcedmisten/fda-510k-analysis"
SOURCE_AUTO = "seed_wcedmisten"
SOURCE_MANUAL = "seed_wcedmisten_manual"
NO_PREDICATE_MARKER = "S"


@dataclass(frozen=True)
class SeedSummary:
    edges: int
    manual_edges: int
    no_predicate_found: int
    skipped_invalid: int
    upstream_commit: str | None


def run(paths: Paths, upstream: Path) -> SeedSummary:
    scripts = upstream / "scripts"
    edges, skipped = _read_pairs(scripts / "predicates.csv")
    manual, manual_skipped = _read_pairs(scripts / "manually_added_links.csv", keep_marker=True)

    # predicates.csv is authoritative: upstream's cleanup pass deleted some hand-entered
    # links (e.g. predicates received after the device), so manual links only tag edges.
    all_edges = set(edges)
    manual_edges = {(d, p) for d, p in manual if p != NO_PREDICATE_MARKER} & all_edges
    no_predicate = sorted({d for d, p in manual if p == NO_PREDICATE_MARKER})

    edge_frame = pl.DataFrame(
        {
            "device": [d for d, _ in sorted(all_edges)],
            "predicate": [p for _, p in sorted(all_edges)],
            "source": [
                SOURCE_MANUAL if e in manual_edges else SOURCE_AUTO for e in sorted(all_edges)
            ],
        },
        schema={"device": pl.String, "predicate": pl.String, "source": pl.String},
    )
    # A device marked "no predicate found" may have gained edges later; those win.
    devices_with_edges = set(edge_frame["device"].to_list())
    no_predicate = [d for d in no_predicate if d not in devices_with_edges]

    paths.seed.mkdir(parents=True, exist_ok=True)
    edge_frame.write_csv(paths.seed_edges)
    pl.DataFrame({"k_number": no_predicate}, schema={"k_number": pl.String}).write_csv(
        paths.seed_no_predicate
    )

    commit = _git_head(upstream)
    summary = SeedSummary(
        edges=edge_frame.height,
        manual_edges=len(manual_edges),
        no_predicate_found=len(no_predicate),
        skipped_invalid=skipped + manual_skipped,
        upstream_commit=commit,
    )
    (paths.seed / "SOURCE.md").write_text(_source_note(summary))
    return summary


def _read_pairs(path: Path, *, keep_marker: bool = False) -> tuple[list[tuple[str, str]], int]:
    pairs: list[tuple[str, str]] = []
    skipped = 0
    with path.open(newline="") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) != 2:
                skipped += 1
                continue
            device = normalize_id(row[0])
            raw_predicate = row[1].strip()
            if keep_marker and raw_predicate == NO_PREDICATE_MARKER:
                predicate: str | None = NO_PREDICATE_MARKER
            else:
                predicate = normalize_id(raw_predicate)
            if device is None or predicate is None:
                skipped += 1
                continue
            pairs.append((device, predicate))
    return pairs, skipped


def _git_head(repo: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout.strip() or None


def _source_note(s: SeedSummary) -> str:
    commit = s.upstream_commit or "unknown"
    return f"""# Seed data

Predicate edges imported from [wcedmisten/fda-510k-analysis]({UPSTREAM_REPO})
(commit `{commit}`), which extracted them from FDA 510(k) summary PDFs with regex,
OCR and manual review. See the upstream author's write-up:
https://wcedmisten-fyi.pages.dev/post/medical-device-analysis

Only the data files were used. No upstream code was copied (it is AGPL-3.0).

Regenerate with `uv run fda510k import-seed --from <path to upstream clone>`.

- `edges.csv` ({s.edges} rows): `device` claimed `predicate`. `source` is
  `{SOURCE_MANUAL}` for the {s.manual_edges} hand-entered links, else `{SOURCE_AUTO}`.
- `no_predicate_found.csv` ({s.no_predicate_found} rows): reviewed by hand upstream,
  no predicate identifiable.
"""
