"""Fetch the three fixture papers from arXiv into tests/fixtures/papers/.

The PDFs are not committed: arXiv's non-exclusive licence gives this repository no
right to redistribute them. Every assertion in the test suite is calibrated to these
exact files, so each download is checked against the sha256 in MANIFEST.json and a
mismatch is an error, never a warning. Run once; files already present and correct are
left alone. This is the only place in the project that uses the network.

    python scripts/fetch_fixtures.py
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

PAPER_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "papers"
MANIFEST = PAPER_DIR / "MANIFEST.json"
USER_AGENT = "paperboard-fixtures/1.0 (test fixtures; see scripts/fetch_fixtures.py)"


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch(name: str, entry: dict) -> None:
    target = PAPER_DIR / f"{name}.pdf"
    if target.exists() and sha256_of(target) == entry["sha256"]:
        print(f"{target.name}: present, hash ok")
        return
    request = urllib.request.Request(entry["url"], headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != entry["sha256"]:
        raise SystemExit(
            f"{target.name}: sha256 mismatch\n  expected {entry['sha256']}\n  got      {digest}\n"
            f"the publisher may have replaced {entry['url']}; the tests are calibrated to the old file."
        )
    target.write_bytes(payload)
    print(f"{target.name}: fetched {len(payload)} bytes, hash ok")


if __name__ == "__main__":
    manifest = json.loads(MANIFEST.read_text())
    wanted = sys.argv[1:] or sorted(manifest)
    for name in wanted:
        fetch(name, manifest[name])
