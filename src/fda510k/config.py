from dataclasses import dataclass
from pathlib import Path

from fda510k import __version__

PIPELINE_VERSION = __version__
USER_AGENT = f"510k-browser/{__version__} (+https://github.com/ianbulovic/510k-browser)"


@dataclass(frozen=True)
class Paths:
    """Repository-relative locations. `root` is the repo checkout."""

    root: Path

    @property
    def build(self) -> Path:
        return self.root / "build"

    @property
    def downloads(self) -> Path:
        return self.build / "downloads"

    @property
    def devices(self) -> Path:
        return self.build / "devices.parquet"

    @property
    def product_codes(self) -> Path:
        return self.build / "product_codes.parquet"

    @property
    def ingest_meta(self) -> Path:
        return self.build / "ingest_meta.json"

    @property
    def graph_edges(self) -> Path:
        return self.build / "graph_edges.parquet"

    @property
    def graph_report(self) -> Path:
        return self.build / "graph_report.json"

    @property
    def site_data(self) -> Path:
        return self.build / "site-data"

    @property
    def seed(self) -> Path:
        return self.root / "seed"

    @property
    def seed_edges(self) -> Path:
        return self.seed / "edges.csv"

    @property
    def seed_no_predicate(self) -> Path:
        return self.seed / "no_predicate_found.csv"

    @property
    def state(self) -> Path:
        return self.root / "state"

    @property
    def extracted_edges(self) -> Path:
        return self.state / "edges.csv"

    @property
    def manual_overrides(self) -> Path:
        return self.state / "manual_overrides.csv"
