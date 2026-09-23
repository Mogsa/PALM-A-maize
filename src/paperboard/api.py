"""Routes and nothing else. Every rule lives in the module it belongs to; this
file turns HTTP into calls and exceptions into the one error shape."""

from contextlib import contextmanager
from pathlib import Path

import pymupdf
from fastapi import FastAPI, File, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field, ValidationError

from paperboard.anchoring import anchor_basis, build_index, resolve_chunk, resolve_highlight
from paperboard.board_model import Board, ChunkNode, FigureNode, NoteNode, TagFile
from paperboard.clips import DEFAULT_DPI, render_clip
from paperboard.export import export_markdown
from paperboard.extract import extract
from paperboard.snap import Selection, select
from paperboard.source_model import PageRect
from paperboard.store import NoteNotFound, PaperNotFound, Store, VersionConflict, atomic_write


class TextRequest(BaseModel):
    rects: list[PageRect] = Field(min_length=1)
    snap: bool = True


class NoteBody(BaseModel):
    markdown: str


class ClipRequest(PageRect):
    dpi: int = DEFAULT_DPI


class ExportRequest(BaseModel):
    tags: list[str] = []


def _error(status: int, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, **extra}})


def create_app(root: Path) -> FastAPI:
    store = Store(root)
    app = FastAPI(title="paperboard", docs_url=None, redoc_url=None)

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

    @app.exception_handler(VersionConflict)
    async def _conflict(_: Request, exc: VersionConflict):
        return _error(409, "version_conflict", str(exc), current=exc.current)

    @app.exception_handler(RequestValidationError)
    async def _invalid(_: Request, exc: RequestValidationError):
        return _error(422, "invalid", str(exc.errors()[0].get("msg", "invalid request")))

    @app.exception_handler(ValidationError)
    async def _invalid_model(_: Request, exc: ValidationError):
        return _error(422, "invalid", str(exc.errors()[0].get("msg", "invalid request")))

    @app.exception_handler(ValueError)
    async def _value(_: Request, exc: ValueError):
        return _error(422, "invalid", str(exc))

    # -- papers -------------------------------------------------------------

    @app.get("/api/papers")
    def list_papers():
        return [p.model_dump() for p in store.list_papers()]

    @app.post("/api/papers", status_code=201)
    async def add_paper(file: UploadFile = File(...)):  # noqa: B008 (FastAPI's own idiom)
        try:
            doc = store.add_paper(await file.read())
        except Exception as exc:  # noqa: BLE001 -- turned into a 500, not swallowed
            return _error(500, "extraction_failed", f"{type(exc).__name__}: {exc}")
        return {"paper_id": doc.paper_id}

    @app.get("/api/papers/{paper_id}/source")
    def get_source(paper_id: str):
        return Response(store.read_source(paper_id).model_dump_json(by_alias=True), media_type="application/json")

    @app.post("/api/papers/{paper_id}/extract")
    def reextract(paper_id: str):
        try:
            doc = extract(store.pdf_path(paper_id))
        except Exception as exc:  # noqa: BLE001 -- turned into a 500, not swallowed
            return _error(500, "extraction_failed", f"{type(exc).__name__}: {exc}")
        store.write_source(paper_id, doc)
        board = resolved_board(paper_id)
        states = {h.id: h.anchor.state for h in board.highlights}
        states.update({n.id: n.data.region.state for n in board.nodes if isinstance(n, (ChunkNode, FigureNode))})
        return {"states": states}

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
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            return select(doc, pdf, body.rects, body.snap)

    @app.put("/api/papers/{paper_id}/clips/{node_id}")
    def put_clip(paper_id: str, node_id: str, body: ClipRequest):
        with opened(paper_id) as pdf:
            png, width, height = render_clip(pdf, PageRect(page=body.page, rect=body.rect), body.dpi)
        return {"clip": store.write_clip(paper_id, node_id, png), "clip_size": {"width": width, "height": height}}

    @app.get("/api/papers/{paper_id}/clips/{node_id}.png")
    def get_clip(paper_id: str, node_id: str):
        path = store.clip_path(paper_id, node_id)
        if not path.exists():
            return _error(404, "clip_not_found", f"no clip for {node_id}")
        return FileResponse(path, media_type="image/png")

    # -- questions, export --------------------------------------------------

    @app.get("/api/papers/{paper_id}/questions")
    def questions(paper_id: str):
        board = store.read_board(paper_id)
        nodes = {n.id: n for n in board.nodes}
        answered: set[str] = set()
        for edge in board.edges:
            for a, handle, b in ((edge.source, edge.sourceHandle, edge.target), (edge.target, edge.targetHandle, edge.source)):
                if isinstance(nodes.get(b), NoteNode):
                    answered.add(handle or a)
        out = []
        for h in board.highlights:
            if "t-question" in h.tags and h.note is None and h.id not in answered:
                out.append({"id": h.id, "kind": "highlight", "text": h.anchor.quote.exact})
        for n in board.nodes:
            if "t-question" in n.data.tags and n.id not in answered and not isinstance(n, NoteNode):
                text = n.data.region.start.exact if isinstance(n, (ChunkNode, FigureNode)) else (n.data.name or "")
                out.append({"id": n.id, "kind": n.type, "text": text})
        return out

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
        with opened(paper_id) as pdf:
            markdown = export_markdown(doc, board, notes, pdf, body.tags)
        path = store.paper_dir(paper_id) / "export.md"
        atomic_write(path, markdown.encode("utf-8"))
        return {"path": str(path), "markdown": markdown}

    # -- tags ---------------------------------------------------------------

    @app.get("/api/tags")
    def get_tags():
        return Response(store.read_tags().model_dump_json(by_alias=True), media_type="application/json")

    @app.put("/api/tags")
    def put_tags(tags: TagFile):
        store.write_tags(tags)
        return Response(store.read_tags().model_dump_json(by_alias=True), media_type="application/json")

    return app
