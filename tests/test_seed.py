from pathlib import Path

import polars as pl

from fda510k import seed
from fda510k.config import Paths


def write_upstream(root: Path, predicates: str, manual: str) -> Path:
    scripts = root / "upstream" / "scripts"
    scripts.mkdir(parents=True)
    (scripts / "predicates.csv").write_text(predicates)
    (scripts / "manually_added_links.csv").write_text(manual)
    return root / "upstream"


def test_import(paths: Paths, tmp_path: Path) -> None:
    upstream = write_upstream(
        tmp_path,
        predicates="device,predicate\nK200002,K190001\nK200003,K#190002\nbad,K190001\n",
        manual=(
            "device,predicate\n"
            "K200003,K190002\n"  # also in predicates.csv: tagged manual
            "K200009,K190009\n"  # removed by upstream cleanup: not imported
            "K200004,S\n"
            "K200002,S\n"  # has edges, so not "no predicate found"
        ),
    )
    summary = seed.run(paths, upstream)

    edges = pl.read_csv(paths.seed_edges)
    assert edges.rows() == [
        ("K200002", "K190001", seed.SOURCE_AUTO),
        ("K200003", "K190002", seed.SOURCE_MANUAL),
    ]
    assert pl.read_csv(paths.seed_no_predicate)["k_number"].to_list() == ["K200004"]
    assert summary.skipped_invalid == 1
    assert summary.upstream_commit is None
    assert "commit `unknown`" in (paths.seed / "SOURCE.md").read_text()
