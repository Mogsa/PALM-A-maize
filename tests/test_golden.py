import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from regenerate_goldens import summarise  # noqa: E402

from conftest import GOLDEN_DIR  # noqa: E402

from paperboard.extract import extract


def test_extraction_matches_its_golden(paper_path, paper_name):
    """Regenerate with: python scripts/regenerate_goldens.py"""
    golden = json.loads((GOLDEN_DIR / f"{paper_name}.json").read_text())
    assert summarise(extract(paper_path)) == golden
