"""Rewrite tests/fixtures/golden/*.json. Run after a deliberate extraction change.

Read the diff before committing: a section count that drops is a regression, and
this script cannot tell the difference.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "tests"))

from conftest import FIXTURES, GOLDEN_DIR  # noqa: E402

from paperboard.extract import extract  # noqa: E402


def summarise(document) -> dict:
    return {
        "page_count": len(document.pages),
        "region_count": len(document.regions),
        "sections": [
            {
                "id": s.id,
                "number": s.number,
                "depth": s.depth,
                "title": s.title,
                "page": s.heading_rect.page,
                "extent_pages": [e.page for e in s.extent],
            }
            for s in document.sections
        ],
        "figures": [
            {"id": f.id, "kind": f.kind, "label": f.label,
             "page": f.rect.page, "confidence": f.confidence}
            for f in document.figures
        ],
    }


if __name__ == "__main__":
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    for name, path in sorted(FIXTURES.items()):
        target = GOLDEN_DIR / f"{name}.json"
        target.write_text(json.dumps(summarise(extract(path)), indent=2) + "\n")
        print(f"wrote {target}")
