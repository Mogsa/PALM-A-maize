"""Routes and nothing else. Every rule lives in the module it belongs to; this
file turns HTTP into calls and exceptions into the one error shape."""

from collections.abc import Callable
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated, Literal

import pymupdf
from fastapi import FastAPI, File, Header, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field, ValidationError, model_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

from paperboard.anchoring import anchor_basis, build_index, resolve_chunk, resolve_highlight
from paperboard.board_model import Board, ChunkNode, FigureNode, NoteNode, TagFile, TemplateFile
from paperboard.clips import DEFAULT_DPI, render_clip, render_etag
from paperboard.export import ExportOrder, export_markdown
from paperboard.extract import extract
from paperboard.snap import Selection, select
from paperboard.source_model import PageRect
from paperboard.split import split
from paperboard.store import (
    NodeNotFound,
    NoteNotFound,
    PaperNotFound,
    Store,
    VersionConflict,
    atomic_write,
)

LOCAL_HOSTS = ["127.0.0.1", "localhost"]


class TextRequest(BaseModel):
    rects: list[PageRect] = Field(min_length=1)
    snap: bool = True
    mode: Literal["text", "area"] = "text"

    @model_validator(mode="after")
    def _area_is_one_rect(self) -> "TextRequest":
        if self.mode == "area" and len(self.rects) != 1:
            raise ValueError("an area selection is exactly one rectangle")
        return self


class RenderQuery(BaseModel):
    page: int = Field(ge=0)
    x0: float
    y0: float
    x1: float
    y1: float
    dpi: int = DEFAULT_DPI

    @model_validator(mode="after")
    def _ordered(self) -> "RenderQuery":
        if not (self.x0 < self.x1 and self.y0 < self.y1):
            raise ValueError("rect must have x0 < x1 and y0 < y1")
        return self

    def target(self) -> PageRect:
        return PageRect(page=self.page, rect=(self.x0, self.y0, self.x1, self.y1))


class NoteBody(BaseModel):
    markdown: str


class ClipRequest(PageRect):
    dpi: int = DEFAULT_DPI


class ExportRequest(BaseModel):
    tags: list[str] = []
    order: ExportOrder = "paper"


def _error(status: int, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, **extra}})


def _anchors(board: Board) -> dict[str, tuple]:
    """(state, geometry) for every highlight and piece, keyed by id: what a
    re-extraction reports as changed when it differs before and after."""
    out: dict[str, tuple] = {h.id: (h.anchor.state, h.anchor.rects) for h in board.highlights}
    for n in board.nodes:
        if isinstance(n, (ChunkNode, FigureNode)):
            out[n.id] = (n.data.region.state, n.data.region.rects)
    return out


def create_app(root: Path) -> FastAPI:
    store = Store(root)
    app = FastAPI(title="paperboard", docs_url=None, redoc_url=None)
    # Bound to 127.0.0.1, but a page elsewhere can rebind its own name to that
    # address; it still sends its own name as Host, so refuse any other.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=LOCAL_HOSTS)

    @contextmanager
    def opened(paper_id: str):
        pdf = pymupdf.open(store.pdf_path(paper_id))
        try:
            yield pdf
        finally:
            pdf.close()

    def resolved_board(paper_id: str) -> Board:
        """The board with anchors re-found, but only when the source text they were
        made against has changed. On an unchanged source the stored anchors are the
        truth: re-finding them measurably shifts some (SPEC-ADDENDUM section 5.2,
        ruling R16), and the frontend autosaves whatever it loads."""
        board = store.read_board(paper_id)
        doc = store.read_source(paper_id)
        basis = anchor_basis(doc)
        if board.anchor_basis == basis:
            return board
        index = build_index(doc)
        with opened(paper_id) as pdf:
            highlights = [h.model_copy(update={"anchor": resolve_highlight(h.anchor, index, pdf)}) for h in board.highlights]
            nodes = []
            for node in board.nodes:
                if isinstance(node, (ChunkNode, FigureNode)):
                    region = resolve_chunk(node.data.region, index, pdf, doc)
                    node = node.model_copy(update={"data": node.data.model_copy(update={"region": region})})
                nodes.append(node)
        return board.model_copy(update={"highlights": highlights, "nodes": nodes, "anchor_basis": basis})

    # -- error shape --------------------------------------------------------

    @app.exception_handler(PaperNotFound)
    async def _paper_missing(_: Request, exc: PaperNotFound):
        return _error(404, "paper_not_found", f"no paper {exc}")

    @app.exception_handler(NoteNotFound)
    async def _note_missing(_: Request, exc: NoteNotFound):
        return _error(404, "note_not_found", f"no note {exc}")

    @app.exception_handler(NodeNotFound)
    async def _node_missing(_: Request, exc: NodeNotFound):
        return _error(404, "node_not_found", f"no node {exc!r}")

    @app.exception_handler(VersionConflict)
    async def _conflict(_: Request, exc: VersionConflict):
        return _error(409, "version_conflict", str(exc), current=exc.current)

    @app.exception_handler(RequestValidationError)
    async def _invalid(_: Request, exc: RequestValidationError):
        return _error(422, "invalid", str(exc.errors()[0].get("msg", "invalid request")))

    # A request body that fails its model is a RequestValidationError, above. A
    # ValidationError that reaches here came from reading board.json, source.json
    # or tags.json off disk: the server's data is corrupt, not the client's payload.
    @app.exception_handler(ValidationError)
    async def _corrupt(_: Request, exc: ValidationError):
        return _error(500, "corrupt_data", f"{exc.title}: {exc.errors()[0].get('msg', 'invalid data')}")

    @app.exception_handler(ValueError)
    async def _value(_: Request, exc: ValueError):
        return _error(422, "invalid", str(exc))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        return _error(500, "internal", f"{type(exc).__name__}: {exc}")

    # -- papers -------------------------------------------------------------

    @app.get("/api/papers")
    def list_papers():
        return [p.model_dump() for p in store.list_papers()]

    def reanchored(paper_id: str, replace: Callable[[], None]) -> dict:
        """Run `replace`, which swaps the paper's source (and perhaps its PDF),
        and report every anchor whose state or geometry it changed. The board
        itself is never written (addendum section 7)."""
        before = _anchors(resolved_board(paper_id))
        replace()
        after = _anchors(resolved_board(paper_id))
        changed = [anchor_id for anchor_id, anchor in after.items() if before.get(anchor_id) != anchor]
        return {"changed": changed, "states": {anchor_id: anchor[0] for anchor_id, anchor in after.items()}}

    @app.post("/api/papers", status_code=201)
    async def add_paper(file: UploadFile = File(...)):  # noqa: B008 (FastAPI's own idiom)
        """A new paper is 201. An existing id is a re-upload (D9): replaced only
        once extraction has succeeded, then re-anchored as for POST /extract."""
        pdf_bytes = await file.read()
        try:
            doc = store.extract_pdf(pdf_bytes)
        except Exception as exc:  # noqa: BLE001 -- turned into a 500, not swallowed
            return _error(500, "extraction_failed", f"{type(exc).__name__}: {exc}")
        if not store.has_paper(doc.paper_id):
            store.install_paper(doc, pdf_bytes)
            return {"paper_id": doc.paper_id}
        report = reanchored(doc.paper_id, lambda: store.install_paper(doc, pdf_bytes))
        return JSONResponse({"paper_id": doc.paper_id, **report}, status_code=200)

    @app.get("/api/papers/{paper_id}/source")
    def get_source(paper_id: str):
        return Response(store.read_source(paper_id).model_dump_json(by_alias=True), media_type="application/json")

    @app.post("/api/papers/{paper_id}/extract")
    def reextract(paper_id: str):
        try:
            doc = extract(store.pdf_path(paper_id))
        except Exception as exc:  # noqa: BLE001 -- turned into a 500, not swallowed
            return _error(500, "extraction_failed", f"{type(exc).__name__}: {exc}")
        return reanchored(paper_id, lambda: store.write_source(paper_id, doc))

    @app.get("/api/papers/{paper_id}/pdf")
    def get_pdf(paper_id: str):
        return FileResponse(store.pdf_path(paper_id), media_type="application/pdf")

    # -- board --------------------------------------------------------------

    @app.get("/api/papers/{paper_id}/board")
    def get_board(paper_id: str):
        return Response(resolved_board(paper_id).model_dump_json(by_alias=True, exclude_none=True), media_type="application/json")

    @app.put("/api/papers/{paper_id}/board")
    def put_board(paper_id: str, board: Board, if_match: str | None = Header(default=None)):
        expected = int(if_match) if if_match is not None and if_match.isdigit() else None
        return {"version": store.write_board(paper_id, board, expected)}

    # -- notes --------------------------------------------------------------

    @app.get("/api/papers/{paper_id}/notes/{node_id}")
    def get_note(paper_id: str, node_id: str):
        return {"markdown": store.read_note(paper_id, node_id)}

    @app.put("/api/papers/{paper_id}/notes/{node_id}", status_code=204)
    def put_note(paper_id: str, node_id: str, body: NoteBody):
        store.write_note(paper_id, node_id, body.markdown)
        return Response(status_code=204)

    # -- text, clips --------------------------------------------------------

    @app.post("/api/papers/{paper_id}/text", response_model=Selection)
    def post_text(paper_id: str, body: TextRequest):
        # mode "area": stub -- the forgiving-rectangle rule of addendum 5.3 (one
        # snapped rect, a single clip block) is a later task; until then an area
        # selection is read as text.
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            return select(doc, pdf, body.rects, body.snap)

    @app.put("/api/papers/{paper_id}/clips/{node_id}")
    def put_clip(paper_id: str, node_id: str, body: ClipRequest):
        with opened(paper_id) as pdf:
            png, width, height = render_clip(pdf, PageRect(page=body.page, rect=body.rect), body.dpi)
        return {"clip": store.write_clip(paper_id, node_id, png), "clip_size": {"width": width, "height": height}}

    @app.get("/api/papers/{paper_id}/render")
    def render(paper_id: str, query: Annotated[RenderQuery, Query()], if_none_match: str | None = Header(default=None)):
        """Stateless: renders, writes nothing. Cached by the browser by ETag."""
        etag = render_etag(store.pdf_sha256(paper_id), query.target(), query.dpi)
        if if_none_match == etag:
            return Response(status_code=304, headers={"ETag": etag})
        with opened(paper_id) as pdf:
            png, _, _ = render_clip(pdf, query.target(), query.dpi)
        return Response(png, media_type="image/png", headers={"ETag": etag})

    @app.get("/api/papers/{paper_id}/clips/{node_id}.png")
    def get_clip(paper_id: str, node_id: str):
        path = store.clip_path(paper_id, node_id)
        if not path.exists():
            return _error(404, "clip_not_found", f"no clip for {node_id}")
        return FileResponse(path, media_type="image/png")

    # -- questions, export --------------------------------------------------

    @app.get("/api/papers/{paper_id}/questions")
    def questions(paper_id: str):
        board = resolved_board(paper_id)   # after re-anchoring, as GET /board (addendum 6)
        nodes = {n.id: n for n in board.nodes}
        # Answered: connected, in either direction, to a note the reader wrote
        # (D14). An AI's note never answers a question for you.
        answered: set[str] = set()
        for edge in board.edges:
            for end, other in ((edge.from_, edge.to), (edge.to, edge.from_)):
                note = nodes.get(other)
                if isinstance(note, NoteNode) and note.data.origin == "reader":
                    answered.add(end)
        out = []
        for h in board.highlights:
            if "t-question" in h.tags and h.id not in answered:
                out.append({"id": h.id, "kind": "highlight", "text": h.anchor.quote.exact})
        for n in board.nodes:
            if "t-question" in n.data.tags and n.id not in answered:
                out.append({"id": n.id, "kind": n.type, "text": question_text(paper_id, n)})
        return out

    def question_text(paper_id: str, node) -> str:
        if isinstance(node, (ChunkNode, FigureNode)):
            return node.data.region.start.exact
        if isinstance(node, NoteNode):
            try:
                markdown = store.read_note(paper_id, node.id).strip()
            except NoteNotFound:
                return ""
            return markdown.splitlines()[0] if markdown else ""
        return node.data.name or ""

    @app.post("/api/papers/{paper_id}/export")
    def export(paper_id: str, body: ExportRequest):
        doc = store.read_source(paper_id)
        board = resolved_board(paper_id)
        notes = {}
        for n in board.nodes:
            if isinstance(n, NoteNode):
                try:
                    notes[n.id] = store.read_note(paper_id, n.id)
                except NoteNotFound:
                    notes[n.id] = ""
        tag_names = {t.id: t.name for t in store.read_tags().tags}
        with opened(paper_id) as pdf:
            markdown = export_markdown(doc, board, notes, pdf, body.tags, body.order, tag_names)
        path = store.paper_dir(paper_id) / "export.md"
        atomic_write(path, markdown.encode("utf-8"))
        return {"path": str(path), "markdown": markdown}

    # -- split --------------------------------------------------------------

    @app.post("/api/papers/{paper_id}/split")
    def post_split(paper_id: str):
        return {"nodes": split(store.read_source(paper_id), store.read_board(paper_id))}

    # -- tags ---------------------------------------------------------------

    @app.get("/api/tags")
    def get_tags():
        return Response(store.read_tags().model_dump_json(by_alias=True), media_type="application/json")

    @app.put("/api/tags")
    def put_tags(tags: TagFile):
        store.write_tags(tags)
        return Response(store.read_tags().model_dump_json(by_alias=True), media_type="application/json")

    # -- template -----------------------------------------------------------

    @app.get("/api/template")
    def get_template():
        return Response(store.read_template().model_dump_json(by_alias=True), media_type="application/json")

    @app.put("/api/template")
    def put_template(template: TemplateFile):
        store.write_template(template)
        return Response(store.read_template().model_dump_json(by_alias=True), media_type="application/json")

    return app
