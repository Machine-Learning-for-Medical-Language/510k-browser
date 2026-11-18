# Seed data

Predicate edges imported from [wcedmisten/fda-510k-analysis](https://github.com/wcedmisten/fda-510k-analysis)
(commit `7c776fdc2b99052822b88d817c54f416ed7134d4`), which extracted them from FDA 510(k) summary PDFs with regex,
OCR and manual review. See the upstream author's write-up:
https://wcedmisten-fyi.pages.dev/post/medical-device-analysis

Only the data files were used. No upstream code was copied (it is AGPL-3.0).

Regenerate with `uv run fda510k import-seed --from <path to upstream clone>`.

- `edges.csv` (152817 rows): `device` claimed `predicate`. `source` is
  `seed_wcedmisten_manual` for the 7313 hand-entered links, else `seed_wcedmisten`.
- `no_predicate_found.csv` (17841 rows): reviewed by hand upstream,
  no predicate identifiable.
