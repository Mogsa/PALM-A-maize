"""Plain files under one root, laid out per SPEC.md section 7.

Atomic writes, a monotonic board version, and nothing clever. A board is a
folder you can copy; this module is what keeps that true.
"""

import hashlib
import os
import re
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pymupdf
from pydantic import BaseModel, TypeAdapter

from paperboard.board_model import (
    DEFAULT_SLOTS,
    PRESET_TAGS,
    Board,
    TagFile,
    TemplateFile,
    dump_board,
    dump_tags,
    dump_template,
)
from paperboard.extract import extract
from paperboard.migrate import is_v1, migrate_board
from paperboard.source_model import SourceDocument

_FRONT_MATTER = re.compile(r"\A---\nid: (?P<id>[^\n]+)\n---\n", re.DOTALL)
# A node id as the client mints it: "n-" and a ULID (addendum 4.5). Checked
# before an id becomes a filename or a front-matter line.
_NODE_ID = re.compile(r"n-[0-9A-HJKMNP-TV-Z]{26}")
# A paper id as extraction makes it: a lowercase slug, then an arXiv id or a short
# hash (`paper_id_for`). Checked before an id from a URL becomes a folder, so `..`
# (sent as `%2e%2e`) never reaches outside `papers/`.
_PAPER_ID = re.compile(r"[a-z0-9][a-z0-9.-]*")
# Parses board.json into a dict before its schema is known. Invalid JSON is a
# ValidationError, like any other corrupt file on disk.
_RAW_BOARD = TypeAdapter(dict[str, Any])


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


def _is_paper_id(paper_id: str) -> bool:
    return bool(_PAPER_ID.fullmatch(paper_id)) and ".." not in paper_id


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

    @property
    def template_path(self) -> Path:
        return self.root / "template.json"

    # -- papers -------------------------------------------------------------

    def paper_dir(self, paper_id: str) -> Path:
        folder = self.papers_dir / paper_id
        if not _is_paper_id(paper_id) or not (folder / "source.json").is_file():
            raise PaperNotFound(paper_id)
        return folder

    def pdf_path(self, paper_id: str) -> Path:
        return self.paper_dir(paper_id) / "paper.pdf"

    def pdf_sha256(self, paper_id: str) -> str:
        return hashlib.sha256(self.pdf_path(paper_id).read_bytes()).hexdigest()

    def list_papers(self) -> list[PaperSummary]:
        out = []
        if not self.papers_dir.is_dir():
            return out
        for folder in sorted(self.papers_dir.iterdir()):
            if not _is_paper_id(folder.name) or not (folder / "source.json").is_file():
                continue
            doc = self.read_source(folder.name)
            title = doc.sections[0].title if doc.sections else folder.name
            out.append(PaperSummary(paper_id=folder.name, title=title, page_count=len(doc.pages)))
        return out

    def has_paper(self, paper_id: str) -> bool:
        return (self.papers_dir / paper_id / "source.json").is_file()

    def extract_pdf(self, pdf_bytes: bytes) -> SourceDocument:
        """Extract a PDF from a scratch copy, touching nothing in the store, so a
        failed extraction leaves any paper with the same id as it was (D9)."""
        with tempfile.TemporaryDirectory() as scratch:
            staged = Path(scratch) / "paper.pdf"
            staged.write_bytes(pdf_bytes)
            return extract(staged)

    def install_paper(self, doc: SourceDocument, pdf_bytes: bytes) -> None:
        """Lay out, or replace, a paper's PDF and `source.json`, each atomically.
        The PDF is always replaced along with source.json: the two in one folder
        must describe one file. The board, notes and clips are kept (D9)."""
        atomic_write(self.papers_dir / doc.paper_id / "paper.pdf", pdf_bytes)
        self.write_source(doc.paper_id, doc)

    def read_source(self, paper_id: str) -> SourceDocument:
        return SourceDocument.model_validate_json((self.paper_dir(paper_id) / "source.json").read_text())

    def write_source(self, paper_id: str, doc: SourceDocument) -> None:
        """The folder name is the paper id, always: a re-extraction that names the
        paper differently (a changed title slug) must not move its board."""
        doc = doc.model_copy(update={"paper_id": paper_id})
        folder = self.papers_dir / paper_id
        atomic_write(folder / "source.json", doc.model_dump_json(by_alias=True, indent=2).encode())

    # -- board --------------------------------------------------------------

    def _read_raw_board(self, paper_id: str) -> dict | None:
        path = self.paper_dir(paper_id) / "board.json"
        return _RAW_BOARD.validate_json(path.read_bytes()) if path.exists() else None

    def read_board(self, paper_id: str) -> Board:
        """The board as schema 2. A schema 1 file is migrated on the way in and
        returned, not written (addendum 4.6)."""
        raw = self._read_raw_board(paper_id)
        if raw is None:
            return Board(paper_id=paper_id)
        if is_v1(raw):
            with pymupdf.open(self.pdf_path(paper_id)) as pdf:
                raw = migrate_board(raw, self.read_source(paper_id), pdf)
        return Board.model_validate(raw)

    def write_board(self, paper_id: str, board: Board, expected_version: int | None) -> int:
        """Refuse unless the caller proves it saw the current version. Two open
        tabs must never silently overwrite each other (addendum section 7)."""
        with self._board_lock:
            current = self.read_board(paper_id).version
            if expected_version is None or expected_version != current:
                raise VersionConflict(current)
            board = board.model_copy(update={"version": current + 1, "paper_id": paper_id})
            self._keep_v1_copy(paper_id)
            atomic_write(self.paper_dir(paper_id) / "board.json", dump_board(board).encode())
            return board.version

    def _keep_v1_copy(self, paper_id: str) -> None:
        """Before the first write over a schema 1 file, copy it once to
        `board.v1.json`: the migration is one-way (addendum 4.6)."""
        folder = self.paper_dir(paper_id)
        raw = self._read_raw_board(paper_id)
        copy = folder / "board.v1.json"
        if raw is not None and is_v1(raw) and not copy.exists():
            atomic_write(copy, (folder / "board.json").read_bytes())

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

    # -- template -----------------------------------------------------------

    def read_template(self) -> TemplateFile:
        """`template.json`, or the nine default slots when there is none (addendum 4.8)."""
        if not self.template_path.exists():
            return TemplateFile(slots=[s.model_copy() for s in DEFAULT_SLOTS])
        return TemplateFile.model_validate_json(self.template_path.read_text())

    def write_template(self, template: TemplateFile) -> None:
        atomic_write(self.template_path, dump_template(template).encode())

    # -- clips --------------------------------------------------------------

    def clip_path(self, paper_id: str, node_id: str) -> Path:
        _check_node_id(node_id)
        return self.paper_dir(paper_id) / "clips" / f"{node_id}.png"

    def write_clip(self, paper_id: str, node_id: str, png: bytes) -> str:
        atomic_write(self.clip_path(paper_id, node_id), png)
        return f"clips/{node_id}.png"
