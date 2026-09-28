"""Routes and nothing else. Every rule lives in the module it belongs to; this
file turns HTTP into calls and exceptions into the one error shape."""

import json
import logging
import threading
from collections.abc import Callable
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated, Literal

import pymupdf
from fastapi import FastAPI, File, Header, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, ValidationError, model_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

from paperboard.ai import WordNotHere, define_context, define_stream, run_pass, word_key
from paperboard.ai_client import AiError, AnthropicClaude, ClaudeClient
from paperboard.ai_model import AiFile
from paperboard.anchoring import anchor_basis, build_index, resolve_chunk, resolve_highlight
from paperboard.blocks import chunk_blocks
from paperboard.board_model import (
    Board,
    ChunkAnchor,
    ChunkNode,
    FigureNode,
    NoteNode,
    QuoteSelector,
    TagFile,
    TemplateFile,
    ViewState,
)
from paperboard.chunk_text import QuoteNotFound, highlight_in_chunk
from paperboard.clips import DEFAULT_DPI, render_clip, render_etag
from paperboard.export import ExportOrder, export_markdown
from paperboard.extract import extract
from paperboard.geometry import Rect
from paperboard.recut import NotContiguous, RecutMode, join, recut
from paperboard.sketch import SketchBody, SketchFile, sketch_svg
from paperboard.snap import Selection, select
from paperboard.source_model import PageRect
from paperboard.split import split
from paperboard.store import (
    NodeNotFound,
    NoteNotFound,
    PaperNotFound,
    SketchNotFound,
    Store,
    VersionConflict,
    atomic_write,
)

logger = logging.getLogger(__name__)

LOCAL_HOSTS = ["127.0.0.1", "localhost"]
# Every write to the API carries this header with the value "1" (addendum section 6).
# A custom header forces a CORS preflight, which this server never grants, so no page
# on another origin can send it: a form posted from elsewhere is refused.
APP_HEADER = "X-Paperboard"
READ_METHODS = {"GET", "HEAD"}
PDF_MAGIC = b"%PDF-"
MAX_UPLOAD_BYTES = 100 * 1024 * 1024   # far above any paper; a guard, not a quota
# A sketch's SVG is built by the server from checked path data (D23); this policy is a second lock: were anything
# in it to try, no script, fetch or external resource would run.
SKETCH_CSP = "default-src 'none'; style-src 'unsafe-inline'"


class TextRequest(BaseModel):
    rects: list[PageRect] = Field(min_length=1)
    snap: bool = True
    mode: Literal["text", "area"] = "text"
    lines: list[PageRect] | None = None   # the browser's own rect per printed line (addendum section 6)

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


class ChunkHighlightRequest(BaseModel):
    region: ChunkAnchor
    quote: QuoteSelector


class RecutRequest(BaseModel):
    region: ChunkAnchor
    at: QuoteSelector
    mode: RecutMode


class JoinRequest(BaseModel):
    regions: list[ChunkAnchor] = Field(min_length=2)


MAX_DEFINE_WORDS = 4


class TextRange(BaseModel):
    page: int = Field(ge=0)
    start: int = Field(ge=0)
    end: int = Field(ge=0)


class DefineRequest(BaseModel):
    word: str = Field(min_length=1, max_length=80)
    page: int = Field(ge=0)
    rect: Rect
    definition: TextRange | None = None

    @model_validator(mode="after")
    def _a_word_or_short_phrase(self) -> "DefineRequest":
        if len(self.word.split()) > MAX_DEFINE_WORDS:
            raise ValueError(f"define a word or a phrase of at most {MAX_DEFINE_WORDS} words")
        return self


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


def create_app(root: Path, claude: ClaudeClient | None = None) -> FastAPI:
    store = Store(root)
    claude = claude or AnthropicClaude()   # built lazily: no credentials are read until a call
    ai_passes: dict[str, str] = {}          # paper id -> "running" or "failed"; in memory only
    ai_messages: dict[str, str] = {}
    ai_lock = threading.Lock()
    view_lock = threading.Lock()   # guards the read-modify-write of view.json's `ai` flag
    app = FastAPI(title="paperboard", docs_url=None, redoc_url=None)
    # Bound to 127.0.0.1, but a page elsewhere can rebind its own name to that
    # address; it still sends its own name as Host, so refuse any other.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=LOCAL_HOSTS)

    @app.middleware("http")
    async def _writes_come_from_the_app(request: Request, call_next):
        if (request.url.path.startswith("/api/") and request.method not in READ_METHODS
                and request.headers.get(APP_HEADER) != "1"):
            return _error(403, "forbidden", f"a write to the API must carry {APP_HEADER}: 1")
        return await call_next(request)

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
                    update = {"region": region}
                    # A chunk that moved shows what is under it now (addendum 4.0).
                    if isinstance(node, ChunkNode) and region.rects != node.data.region.rects:
                        update["blocks"] = chunk_blocks(doc, pdf, region.rects)
                    node = node.model_copy(update={"data": node.data.model_copy(update=update)})
                nodes.append(node)
        return board.model_copy(update={"highlights": highlights, "nodes": nodes, "anchor_basis": basis})

    # -- error shape --------------------------------------------------------

    @app.exception_handler(PaperNotFound)
    async def _paper_missing(_: Request, exc: PaperNotFound):
        return _error(404, "paper_not_found", f"no paper {exc}")

    @app.exception_handler(NoteNotFound)
    async def _note_missing(_: Request, exc: NoteNotFound):
        return _error(404, "note_not_found", f"no note {exc}")

    @app.exception_handler(SketchNotFound)
    async def _sketch_missing(_: Request, exc: SketchNotFound):
        return _error(404, "sketch_not_found", f"no sketch for {exc}")

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

    @app.exception_handler(QuoteNotFound)
    async def _quote_missing(_: Request, exc: QuoteNotFound):
        return _error(422, "quote_not_found", str(exc))

    @app.exception_handler(NotContiguous)
    async def _not_neighbours(_: Request, exc: NotContiguous):
        return _error(422, "not_contiguous", str(exc))

    @app.exception_handler(WordNotHere)
    async def _word_not_here(_: Request, exc: WordNotHere):
        return _error(422, "word_not_here", str(exc))

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
        pdf_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(pdf_bytes) > MAX_UPLOAD_BYTES:
            return _error(413, "too_large", f"a paper may be at most {MAX_UPLOAD_BYTES} bytes")
        if not pdf_bytes.startswith(PDF_MAGIC):
            return _error(415, "not_pdf", "the upload is not a PDF")
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

    # -- view ---------------------------------------------------------------

    @app.get("/api/papers/{paper_id}/view")
    def get_view(paper_id: str):
        return store.read_view(paper_id).model_dump()

    @app.put("/api/papers/{paper_id}/view", status_code=204)
    def put_view(paper_id: str, view: ViewState):
        store.write_view(paper_id, view)
        return Response(status_code=204)

    # -- notes --------------------------------------------------------------

    @app.get("/api/papers/{paper_id}/notes/{node_id}")
    def get_note(paper_id: str, node_id: str):
        """A note is missing only when it has neither text nor a sketch."""
        has_sketch = store.has_sketch(paper_id, node_id)
        try:
            markdown = store.read_note(paper_id, node_id)
        except NoteNotFound:
            if not has_sketch:
                raise
            markdown = ""
        return {"markdown": markdown, "has_sketch": has_sketch}

    @app.put("/api/papers/{paper_id}/notes/{node_id}", status_code=204)
    def put_note(paper_id: str, node_id: str, body: NoteBody):
        store.write_note(paper_id, node_id, body.markdown)
        return Response(status_code=204)

    @app.put("/api/papers/{paper_id}/notes/{node_id}/sketch", status_code=204)
    def put_sketch(paper_id: str, node_id: str, body: SketchBody):
        sketch = SketchFile(width=body.width, height=body.height, strokes=body.strokes)
        store.write_sketch(paper_id, node_id, sketch, sketch_svg(body.width, body.height, body.paths))
        return Response(status_code=204)

    @app.get("/api/papers/{paper_id}/notes/{node_id}/sketch")
    def get_sketch(paper_id: str, node_id: str):
        return Response(store.read_sketch(paper_id, node_id).model_dump_json(), media_type="application/json")

    @app.get("/api/papers/{paper_id}/notes/{node_id}/sketch.svg")
    def get_sketch_svg(paper_id: str, node_id: str):
        path = store.sketch_svg_path(paper_id, node_id)
        return FileResponse(path, media_type="image/svg+xml", headers={"Content-Security-Policy": SKETCH_CSP})

    @app.delete("/api/papers/{paper_id}/notes/{node_id}/sketch", status_code=204)
    def delete_sketch(paper_id: str, node_id: str):
        store.delete_sketch(paper_id, node_id)
        return Response(status_code=204)

    # -- text, clips --------------------------------------------------------

    @app.post("/api/papers/{paper_id}/text", response_model=Selection)
    def post_text(paper_id: str, body: TextRequest):
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            return select(doc, pdf, body.rects, body.snap, body.mode, body.lines)

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
        # Answered: connected, in either direction, to a note the reader wrote
        # (D14) and wrote something in. An AI's note never answers a question for
        # you, and nor does a note made to answer and left empty.
        answers = {n.id for n in board.nodes
                   if isinstance(n, NoteNode) and n.data.origin == "reader" and note_markdown(paper_id, n.id).strip()}
        answered: set[str] = set()
        for edge in board.edges:
            for end, other in ((edge.from_, edge.to), (edge.to, edge.from_)):
                if other in answers:
                    answered.add(end)
        out = []
        for h in board.highlights:
            if "t-question" in h.tags and h.id not in answered:
                out.append({"id": h.id, "kind": "highlight", "text": h.anchor.quote.exact})
        for n in board.nodes:
            if "t-question" in n.data.tags and n.id not in answered:
                out.append({"id": n.id, "kind": n.type, "text": question_text(paper_id, n)})
        return out

    def note_markdown(paper_id: str, node_id: str) -> str:
        """A note's body, or empty when its file was never written."""
        try:
            return store.read_note(paper_id, node_id)
        except NoteNotFound:
            return ""

    def question_text(paper_id: str, node) -> str:
        if isinstance(node, (ChunkNode, FigureNode)):
            return node.data.region.start.exact
        if isinstance(node, NoteNode):
            markdown = note_markdown(paper_id, node.id).strip()
            return markdown.splitlines()[0] if markdown else ""
        return node.data.name or ""

    @app.post("/api/papers/{paper_id}/export")
    def export(paper_id: str, body: ExportRequest):
        doc = store.read_source(paper_id)
        board = resolved_board(paper_id)
        notes = {n.id: note_markdown(paper_id, n.id) for n in board.nodes if isinstance(n, NoteNode)}
        sketches = {note_id for note_id in notes if store.has_sketch(paper_id, note_id)}
        tag_names = {t.id: t.name for t in store.read_tags().tags}
        with opened(paper_id) as pdf:
            markdown = export_markdown(doc, board, notes, pdf, body.tags, body.order, tag_names, sketches)
        path = store.paper_dir(paper_id) / "export.md"
        atomic_write(path, markdown.encode("utf-8"))
        return {"path": str(path), "markdown": markdown}

    # -- split --------------------------------------------------------------

    @app.post("/api/papers/{paper_id}/split")
    def post_split(paper_id: str):
        doc, board = store.read_source(paper_id), store.read_board(paper_id)
        with opened(paper_id) as pdf:
            return {"nodes": split(doc, board, pdf)}

    # -- chunks on the board (addendum 4.10) --------------------------------

    @app.post("/api/papers/{paper_id}/chunks/highlight")
    def post_chunk_highlight(paper_id: str, body: ChunkHighlightRequest):
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            return {"highlight": highlight_in_chunk(doc, pdf, body.region, body.quote).model_dump(mode="json")}

    @app.post("/api/papers/{paper_id}/chunks/split")
    def post_chunk_split(paper_id: str, body: RecutRequest):
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            return {"nodes": recut(doc, pdf, body.region, body.at, body.mode)}

    @app.post("/api/papers/{paper_id}/chunks/join")
    def post_chunk_join(paper_id: str, body: JoinRequest):
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            node, order = join(doc, pdf, body.regions)
        return {"node": node, "order": order}

    # -- ai (spec B3) ---------------------------------------------------------

    def ai_off(paper_id: str) -> JSONResponse | None:
        if not store.read_view(paper_id).ai:
            return _error(409, "ai_off", "AI help is off for this paper")
        return None

    def ai_status(paper_id: str, status: str, ai: AiFile | None) -> dict:
        return {"status": status, "stale": bool(ai and store.ai_is_stale(paper_id, ai)),
                "message": ai_messages.get(paper_id), "ai": ai.model_dump(mode="json", by_alias=True) if ai else None}

    @app.get("/api/papers/{paper_id}/ai")
    def get_ai(paper_id: str):
        ai = store.read_ai(paper_id)
        status = ai_passes.get(paper_id) or ("done" if ai and ai.reader else "none")
        if ai is None and status == "none":
            return _error(404, "ai_not_found", f"no AI pass for {paper_id}")
        return ai_status(paper_id, status, ai)

    def _turn_ai_off(paper_id: str) -> None:
        """Read-modify-write of view.json's `ai` flag, kept as short as possible
        and serialised against concurrent writers (Store has no dedicated view
        lock of its own to reuse)."""
        with view_lock:
            store.write_view(paper_id, store.read_view(paper_id).model_copy(update={"ai": False}))

    @app.post("/api/papers/{paper_id}/ai")
    def post_ai(paper_id: str):
        if (refused := ai_off(paper_id)) is not None:
            return refused
        with ai_lock:
            if ai_passes.get(paper_id) == "running":
                return _error(409, "ai_running", "an AI pass is already running for this paper")
            ai_passes[paper_id] = "running"
            ai_messages.pop(paper_id, None)
        # Everything from here on runs while the paper is marked "running": any exception,
        # known or not, must clear that back to "failed" so a pass can never get stuck running.
        try:
            doc = store.read_source(paper_id)
            slots = [s.name for s in store.read_template().slots]
            with opened(paper_id) as pdf:
                reader = run_pass(doc, pdf, slots, claude)

            def with_reader(current: AiFile | None) -> AiFile:
                keep = current.defined if current and current.extracted_at == doc.extracted_at else {}
                return AiFile(extracted_at=doc.extracted_at, reader=reader, defined=keep)

            ai = store.update_ai(paper_id, with_reader)
        except (AiError, ValueError) as exc:
            message = f"AI help could not run: {exc}"
            ai_passes[paper_id], ai_messages[paper_id] = "failed", message
            _turn_ai_off(paper_id)
            return _error(502, "ai_failed", message)
        except Exception as exc:
            message = f"AI help could not run: {type(exc).__name__}: {exc}"
            ai_passes[paper_id], ai_messages[paper_id] = "failed", message
            _turn_ai_off(paper_id)
            logger.exception("unexpected error running the AI pass for %s", paper_id)
            raise
        else:
            ai_passes.pop(paper_id, None)
            return ai_status(paper_id, "done", ai)

    def ndjson(line: dict) -> bytes:
        return (json.dumps(line) + "\n").encode()

    @app.post("/api/papers/{paper_id}/ai/define")
    def post_define(paper_id: str, body: DefineRequest):
        if (refused := ai_off(paper_id)) is not None:
            return refused
        key = word_key(body.word)
        saved = store.read_ai(paper_id)
        if saved and key in saved.defined and not store.ai_is_stale(paper_id, saved):
            return StreamingResponse(iter([ndjson({"done": saved.defined[key].model_dump(mode="json")})]),
                                     media_type="application/x-ndjson")
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            context = define_context(doc, pdf, body.word, body.page, body.rect,
                                     body.definition.model_dump() if body.definition else None)

        def save(current: AiFile | None, value=None) -> AiFile:
            # A definition is only ever merged into an ai.json made from the *current*
            # extraction: an older one is replaced fresh, keeping `reader` (it stays
            # marked stale by ai_is_stale) but dropping `defined`, which pointed at spans
            # from the old extraction and would otherwise wrongly answer this word from
            # the cache next time.
            base = current if current and current.extracted_at == doc.extracted_at else AiFile(extracted_at=doc.extracted_at, reader=current.reader if current else None)
            return base.model_copy(update={"defined": {**base.defined, key: value}})

        def lines():
            try:
                for kind, value in define_stream(claude, body.word, context):
                    if kind == "delta":
                        yield ndjson({"delta": value})
                    elif value is None:
                        yield ndjson({"error": "AI help could not find this in the paper."})
                    else:
                        store.update_ai(paper_id, lambda cur, value=value: save(cur, value))
                        yield ndjson({"done": value.model_dump(mode="json")})
            except AiError as exc:
                yield ndjson({"error": f"AI help could not run: {exc}"})
            except Exception as exc:
                logger.exception("unexpected error while defining %r for %s", body.word, paper_id)
                yield ndjson({"error": f"AI help could not run: {type(exc).__name__}: {exc}"})

        return StreamingResponse(lines(), media_type="application/x-ndjson")

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
