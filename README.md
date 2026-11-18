# 510k-browser

Browse FDA 510(k) clearances, read their summary documents, and explore the graph of
devices and the predicates they claimed substantial equivalence to.

The site is fully static (GitHub Pages). A scheduled GitHub Action rebuilds the data.
See [PLAN.md](PLAN.md) for the full design and milestones.

> **Informational only.** This project is not affiliated with the FDA. Predicate links
> are extracted automatically and may be wrong; always verify against the FDA record.

## Development

Requires [uv](https://github.com/astral-sh/uv).

```sh
uv sync                  # create the venv and install dependencies
uv run fda510k --help    # pipeline CLI
uv run pytest            # tests
uv run ruff format       # format
uv run ruff check        # lint
uv run ty check          # type check
```

## Pipeline

```sh
uv run fda510k ingest            # openFDA 510(k) + classification bulk data -> build/
uv run fda510k graph             # seed/ + state/manual_overrides.csv -> build/graph_edges.parquet
uv run fda510k build-site-data   # -> build/site-data/ (static JSON for the frontend)
uv run fda510k all               # all three, in order
```

`build/` is never committed. The committed inputs are:

- `seed/`: predicate edges imported once from
  [wcedmisten/fda-510k-analysis](https://github.com/wcedmisten/fda-510k-analysis)
  (see [seed/SOURCE.md](seed/SOURCE.md)). Regenerate with `fda510k import-seed --from <clone>`.
- `state/manual_overrides.csv`: hand corrections (`device,predicate,action,reason,author`,
  where `action` is `add` or `remove`). Applied last.

## License

Code: [MIT](LICENSE).
