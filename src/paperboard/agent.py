"""Bring your own agent (spec 2026-09-30): the library folder as a workspace for any AI
agent. This module writes what an agent reads (AGENTS.md at the root, paper.md and
board.md beside each paper) and reads what an agent writes (papers/<id>/agent/*.md).
Nothing an agent writes reaches the board here: only the reader's Put on board does."""

import os
import re
from collections.abc import Set as AbstractSet
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel

from paperboard.board_model import Board, NoteNode
from paperboard.export import export_markdown
from paperboard.source_model import SourceDocument
from paperboard.store import atomic_write

AGENT_DIR = "agent"
PLACED_DIR = "placed"
PAPER_MD = "paper.md"
BOARD_MD = "board.md"

AGENTS_MD = """\
# Paper Board library: read this first

This folder is a reader's Paper Board library. You are here to help them read a paper,
not to read it for them.

## What is here

Each paper has a folder, `papers/<id>/`:

- `paper.md`: the paper's text, section by section, with its pages. Start here.
- `paper.pdf`: the paper itself.
- `board.md`: the reader's own highlights and notes, in the paper's order. Each
  highlight, piece and note is followed by its id, as `<!-- id: h-01J... -->`.
- `board.json`, `view.json`: the reader's board, and how it is shown.
- `notes/`: the reader's notes, one Markdown file each.
- `source.json`: the paper as Paper Board took it apart.
- `ai.json`, `ai-log.jsonl`, `chat.jsonl`: Paper Board's own AI help, and its logs.
- `activity.jsonl`: a log of what the reader did.
- `agent/`: your notes. `agent/placed/` holds the ones the reader put on their board.

At the top are `tags.json` and `template.json`: the reader's tags and reading template.

## The rule

Read anything. Write only into `papers/<id>/agent/`. Never edit, move or delete any
other file: not `board.json`, `notes/`, `view.json`, `source.json`, `ai.json`, nor any log.

## How to write a note

One Markdown file per note in `papers/<id>/agent/`, named in a few words and ending in
`.md`, such as `why-shortcuts.md`. The front matter is optional:

```markdown
---
on: h-01J9Z3K4M5N6P7Q8R9S0T1V2W3
title: Why deeper plain nets do worse
---
The paper says it is not overfitting: "such degradation is not caused by
overfitting" (p. 1, §1 Introduction). Compare the training curves in Figure 1.
```

- `on`: the id of the highlight, piece or note in `board.md` your note is about. When
  the reader puts your note on their board, it is connected to that. Leave it out when
  the note is about nothing in particular.
- `title`: a few words.

The reader sees your notes in Paper Board, marked AI. None reaches their board unless
they put it there.

## How to help

- Quote the paper exactly and say where: page and section, as (p. 3, §3.1). Pages are
  the PDF's, counted from 1, as in `paper.md`. The reader must be able to check you.
- Explain and point. Never write the reader's answers, and never edit their notes: their
  words and their thinking stay theirs. Say what the paper says and where, suggest what
  to look at, and leave the conclusions to them.
- One idea per note, in a few sentences.
"""

POINTER_MD = "Read AGENTS.md in this folder and follow it.\n"

INSTRUCTION_FILES = {"AGENTS.md": AGENTS_MD, "GEMINI.md": POINTER_MD, "CLAUDE.md": POINTER_MD}

# An agent note's file name: one plain name ending in .md, never a path, never hidden.
_NOTE_FILE = re.compile(r"[^/\\.][^/\\]*\.md")
_FRONT_MATTER = re.compile(r"\A---\n(?P<head>.*?)\n---\n", re.DOTALL)
_FIELD = re.compile(r"(?P<key>[A-Za-z_][\w-]*):[ \t]*(?P<value>.*)")


class AgentNoteNotFound(Exception):
    pass


class AgentNote(BaseModel):
    file: str
    title: str | None
    on: str | None
    text: str
    modified: datetime


# -- instructions ----------------------------------------------------------------


def write_instructions(root: Path) -> None:
    """AGENTS.md, GEMINI.md and CLAUDE.md at the library root, each only when missing:
    the reader may have written their own."""
    for name, text in INSTRUCTION_FILES.items():
        path = root / name
        if not path.exists():
            atomic_write(path, text.encode("utf-8"))


# -- paper.md --------------------------------------------------------------------


def _pages(section) -> str:
    pages = sorted({section.heading_rect.page, *(e.page for e in section.extent)})
    first, last = pages[0] + 1, pages[-1] + 1
    return f"p. {first}" if first == last else f"pp. {first}–{last}"


def paper_markdown(doc: SourceDocument) -> str:
    """The paper's text by section, in order, each heading with its pages (counted from 1).
    The first section is the title, as the export and the paper list take it."""
    if not doc.sections:
        return f"# {doc.paper_id}\n"
    title, *rest = doc.sections
    out = [f"# {title.title}", ""]
    if title.text.strip():
        out += [title.text.strip(), ""]
    for section in rest:
        out += [f"{'#' * (section.depth + 1)} {section.title} ({_pages(section)})", ""]
        if section.text.strip():
            out += [section.text.strip(), ""]
    return "\n".join(out).rstrip() + "\n"


def write_paper_md(folder: Path, doc: SourceDocument) -> None:
    atomic_write(folder / PAPER_MD, paper_markdown(doc).encode("utf-8"))


def paper_md_is_stale(folder: Path) -> bool:
    """Missing, or older than the source it was made from."""
    path = folder / PAPER_MD
    return not path.exists() or path.stat().st_mtime < (folder / "source.json").stat().st_mtime


# -- board.md --------------------------------------------------------------------


def reader_board(board: Board) -> Board:
    """The board without the AI's notes and the edges to them: only the reader's things."""
    ai = {n.id for n in board.nodes if isinstance(n, NoteNode) and n.data.origin == "ai"}
    return board.model_copy(update={
        "nodes": [n for n in board.nodes if n.id not in ai],
        "edges": [e for e in board.edges if e.from_ not in ai and e.to not in ai],
    })


def board_markdown(doc: SourceDocument, board: Board, notes: dict[str, str],
                   tag_names: dict[str, str], sketches: AbstractSet[str]) -> str:
    """The export's text of the reader's own layer, in the paper's order, with every id
    written so an agent can name what its note is `on`."""
    mine = reader_board(board)
    kept = {n.id for n in mine.nodes}
    return export_markdown(doc, mine, {k: v for k, v in notes.items() if k in kept}, None, [], "paper",
                           tag_names, {s for s in sketches if s in kept}, ids=True)


def write_board_md(folder: Path, markdown: str) -> None:
    atomic_write(folder / BOARD_MD, markdown.encode("utf-8"))


# -- agent notes -----------------------------------------------------------------


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def _front_matter(raw: str) -> tuple[dict[str, str], str]:
    """The fields and the body. Front matter that is malformed (a line that is not
    `key: value`, or no closing `---`) is treated as none: the whole file is the body."""
    match = _FRONT_MATTER.match(raw)
    if not match:
        return {}, raw
    fields: dict[str, str] = {}
    for line in match.group("head").splitlines():
        if not line.strip():
            continue
        field = _FIELD.fullmatch(line.strip())
        if not field:
            return {}, raw
        fields[field.group("key")] = field.group("value")
    return fields, raw[match.end():]


def parse_agent_note(file: str, raw: str, modified: datetime) -> AgentNote:
    """`title` and `on` are read; any other field is ignored. `on` is an id, so only its
    first word counts (a trailing `# comment` copied from an example is dropped)."""
    fields, body = _front_matter(raw)
    title = _unquote(fields.get("title", "")) or None
    on_words = _unquote(fields.get("on", "")).split()
    return AgentNote(file=file, title=title, on=on_words[0] if on_words else None, text=body, modified=modified)


def list_agent_notes(paper_folder: Path) -> list[AgentNote]:
    """Every note waiting in `agent/`, newest first; placed notes are not listed."""
    folder = paper_folder / AGENT_DIR
    if not folder.is_dir():
        return []
    notes = []
    for path in folder.iterdir():
        if not path.is_file() or not _NOTE_FILE.fullmatch(path.name):
            continue
        modified = datetime.fromtimestamp(path.stat().st_mtime, UTC)
        notes.append(parse_agent_note(path.name, path.read_text(encoding="utf-8", errors="replace"), modified))
    return sorted(notes, key=lambda n: (n.modified, n.file), reverse=True)


def mark_placed(paper_folder: Path, file: str) -> None:
    """Move `agent/<file>` into `agent/placed/`: it is on the board now, and listed no more."""
    if not _NOTE_FILE.fullmatch(file):
        raise ValueError(f"not an agent note's file name: {file!r}")
    source = paper_folder / AGENT_DIR / file
    if not source.is_file():
        raise AgentNoteNotFound(file)
    placed = paper_folder / AGENT_DIR / PLACED_DIR
    placed.mkdir(exist_ok=True)
    os.replace(source, placed / file)
