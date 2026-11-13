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

## License

Code: [MIT](LICENSE).
