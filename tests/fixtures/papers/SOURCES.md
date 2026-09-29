# Fixture papers

The three PDFs are **not committed**. They are distributed by arXiv under its perpetual
non-exclusive licence (`http://arxiv.org/licenses/nonexclusive-distrib/1.0/`), which grants
arXiv the right to distribute them and grants this repository none. This project is
AGPL-3.0 and cannot ship files it has no right to redistribute.

Fetch them once, with hash verification, before running the tests:

    python scripts/fetch_fixtures.py

`MANIFEST.json` beside this file records each paper's arXiv id, URL, sha256, and size. The
test suite is calibrated to these exact files, so a hash mismatch is an error. If arXiv
replaces a version, pin the manifest to the old version's URL rather than re-measuring.

If a fixture is ever added, check the licence line on its arXiv abstract page first. A
CC-BY paper could be committed outright; these three cannot.

| File | arXiv | Title | Why this one |
|---|---|---|---|
| attention.pdf | 1706.03762v7 | Attention Is All You Need | Has a PDF outline. Single column. Heavy tables. |
| resnet.pdf | 1512.03385v1 | Deep Residual Learning for Image Recognition | No PDF outline. Two columns, figure- and table-dense. Figure 2's caption is merged into its picture region by the layout model, the one documented figure miss. |
| adam.pdf | 1412.6980v9 | Adam: A Method for Stochastic Optimization | No outline, small-caps headings smaller than body text, display equations. The hard case. |
| ross11a.pdf | PMLR v15 (AISTATS 2011) | Ross, Gordon & Bagnell, A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning | Sections suite only (`"suite": "sections"` in the manifest): no outline, and the layout model misses numbered headings on page 6. Fetched from proceedings.mlr.press, not committed. |
