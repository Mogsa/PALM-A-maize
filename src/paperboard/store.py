"""Plain files under one root, laid out per SPEC.md section 7.

Atomic writes, a monotonic board version, and nothing clever. A board is a
folder you can copy; this module is what keeps that true.
"""

import os
import re
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel

from paperboard.board_model import PRESET_TAGS, Board, TagFile, dump_board, dump_tags
from paperboard.extract import extract
from paperboard.source_model import SourceDocument

_FRONT_MATTER = re.compile(r"\A---\nid: (?P<id>[^\n]+)\n---\n", re.DOTALL)
# A node id as the client mints it: "n-" and a ULID (addendum 4.5). Checked
# before an id becomes a filename or a front-matter line.
_NODE_ID = re.compile(r"n-[0-9A-HJKMNP-TV-Z]{26}")


class PaperNotFound(Exception):
    pass


class NoteNotFound(Exception):
    pass


class NodeNotFound(Exception):
    """An id no client could have minted, so no node can have it."""


class VersionConflict(Exception):
    def __init__(self, current: int):
        super().__init__(f"board is at version {current}")
        self.current = current


class PaperSummary(BaseModel):
    paper_id: str
    title: str
    page_count: int


def atomic_write(path: Path, data: bytes) -> None:
    """tmp in the same directory, fsync, then os.replace. A crash mid-write leaves
    the old file intact; a failed replace leaves no tmp file behind."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def _check_node_id(node_id: str) -> None:
    if not _NODE_ID.fullmatch(node_id):
        raise NodeNotFound(node_id)


@dataclass
class Store:
    root: Path
    # FastAPI runs sync routes in a thread pool: without this, two writes of the
    # same version can both read it, both pass the check, and both succeed.
    _board_lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False, compare=False)

    @property
    def papers_dir(self) -> Path:
        return self.root / "papers"

    @property
    def tags_path(self) -> Path:
        return self.root / "tags.json"

    # -- papers -------------------------------------------------------------

    def paper_dir(self, paper_id: str) -> Path:
        folder = self.papers_dir / paper_id
        if not (folder / "source.json").is_file():
            raise PaperNotFound(paper_id)
        return folder

    def pdf_path(self, paper_id: str) -> Path:
        return self.paper_dir(paper_id) / "paper.pdf"

    def list_papers(self) -> list[PaperSummary]:
        out = []
        if not self.papers_dir.is_dir():
            return out
        for folder in sorted(self.papers_dir.iterdir()):
            if not (folder / "source.json").is_file():
                continue
            doc = self.read_source(folder.name)
            title = doc.sections[0].title if doc.sections else folder.name
            out.append(PaperSummary(paper_id=folder.name, title=title, page_count=len(doc.pages)))
        return out

    def add_paper(self, pdf_bytes: bytes) -> SourceDocument:
        """Extract a PDF and lay out its folder. Idempotent for the same bytes,
        because paper_id is a pure function of the file (extractor Task 7).
        A newer arXiv version has the same id, so the PDF is always replaced
        along with source.json: the two in one folder must describe one file."""
        with tempfile.TemporaryDirectory() as scratch:
            staged = Path(scratch) / "paper.pdf"
            staged.write_bytes(pdf_bytes)
            doc = extract(staged)
        atomic_write(self.papers_dir / doc.paper_id / "paper.pdf", pdf_bytes)
        self.write_source(doc.paper_id, doc)
        return doc

    def read_source(self, paper_id: str) -> SourceDocument:
        return SourceDocument.model_validate_json((self.paper_dir(paper_id) / "source.json").read_text())

    def write_source(self, paper_id: str, doc: SourceDocument) -> None:
        """The folder name is the paper id, always: a re-extraction that names the
        paper differently (a changed title slug) must not move its board."""
        doc = doc.model_copy(update={"paper_id": paper_id})
        folder = self.papers_dir / paper_id
        atomic_write(folder / "source.json", doc.model_dump_json(by_alias=True, indent=2).encode())

    # -- board --------------------------------------------------------------

    def read_board(self, paper_id: str) -> Board:
        path = self.paper_dir(paper_id) / "board.json"
        if not path.exists():
            return Board(paper_id=paper_id)
        return Board.model_validate_json(path.read_text())

    def write_board(self, paper_id: str, board: Board, expected_version: int | None) -> int:
        """Refuse unless the caller proves it saw the current version. Two open
        tabs must never silently overwrite each other (addendum section 7)."""
        with self._board_lock:
            current = self.read_board(paper_id).version
            if expected_version is None or expected_version != current:
                raise VersionConflict(current)
            board = board.model_copy(update={"version": current + 1, "paper_id": paper_id})
            atomic_write(self.paper_dir(paper_id) / "board.json", dump_board(board).encode())
            return board.version

    # -- notes --------------------------------------------------------------

    def read_note(self, paper_id: str, node_id: str) -> str:
        path = self.paper_dir(paper_id) / "notes" / f"{node_id}.md"
        if not _NODE_ID.fullmatch(node_id) or not path.exists():
            raise NoteNotFound(node_id)
        raw = path.read_text(encoding="utf-8")
        match = _FRONT_MATTER.match(raw)
        return raw[match.end():] if match else raw

    def write_note(self, paper_id: str, node_id: str, markdown: str) -> None:
        _check_node_id(node_id)
        body = f"---\nid: {node_id}\n---\n{markdown}"
        atomic_write(self.paper_dir(paper_id) / "notes" / f"{node_id}.md", body.encode("utf-8"))

    # -- tags ---------------------------------------------------------------

    def read_tags(self) -> TagFile:
        if not self.tags_path.exists():
            return TagFile(tags=[t.model_copy() for t in PRESET_TAGS])
        return TagFile.model_validate_json(self.tags_path.read_text())

    def write_tags(self, tags: TagFile) -> None:
        atomic_write(self.tags_path, dump_tags(tags).encode())

    # -- clips --------------------------------------------------------------

    def clip_path(self, paper_id: str, node_id: str) -> Path:
        _check_node_id(node_id)
        return self.paper_dir(paper_id) / "clips" / f"{node_id}.png"

    def write_clip(self, paper_id: str, node_id: str, png: bytes) -> str:
        atomic_write(self.clip_path(paper_id, node_id), png)
        return f"clips/{node_id}.png"
