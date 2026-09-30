"""`paperboard extract` and `paperboard serve`."""

import os
import shutil
from collections.abc import Callable, Mapping
from pathlib import Path

import anthropic
import typer
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from paperboard.ai_client import AnthropicClaude, ClaudeClient, NoClaude
from paperboard.api import create_app
from paperboard.canned_claude import CannedClaude
from paperboard.claude_code import CLAUDE_EXE, ClaudeCodeClaude
from paperboard.extract import extract
from paperboard.store import atomic_write

HOST = "127.0.0.1"
DEFAULT_PORT = 8765
# web/dist beside the package (src/paperboard/ → repo root), so serve finds it from any folder.
DEFAULT_WEB = Path(__file__).resolve().parents[2] / "web" / "dist"
# TEST ONLY: names a JSON answer for a canned Claude (e2e). Unset, serve talks to the real API.
FAKE_CLAUDE_ENV = "PAPERBOARD_FAKE_CLAUDE"
API_KEY_ENV = "ANTHROPIC_API_KEY"
KEY_FILE = Path.home() / ".config" / "paperboard" / "anthropic_key"

app = typer.Typer(help="Take a paper apart so its ideas can be laid out.")


@app.callback()
def main() -> None:
    """paperboard: take a paper apart so its ideas can be laid out.

    A no-op callback. Without it, a Typer app with exactly one registered
    command collapses to that command directly, so `paperboard extract
    file.pdf` would parse "extract" as the pdf argument instead of
    dispatching the extract command (Ruling F4).
    """


def claude_from_env(env: Mapping[str, str]) -> ClaudeClient | None:
    """TEST ONLY: the canned Claude FAKE_CLAUDE_ENV names, else None (the real one)."""
    answer = env.get(FAKE_CLAUDE_ENV)
    return CannedClaude(Path(answer)) if answer else None


def _saved_key(env: Mapping[str, str], key_file: Path) -> str | None:
    """An API key from the env, else from the key file. Never logged."""
    key = env.get(API_KEY_ENV, "").strip()
    if not key and key_file.is_file():
        key = key_file.read_text(encoding="utf-8").strip()
    return key or None


def choose_claude(env: Mapping[str, str], key_file: Path = KEY_FILE,
                  which: Callable[[str], str | None] = shutil.which) -> tuple[ClaudeClient, str]:
    """The Claude serve uses, and one line saying which: canned (tests) > API key > Claude Code > none."""
    canned = claude_from_env(env)
    if canned:
        return canned, "AI help: canned answers (test only)"
    key = _saved_key(env, key_file)
    if key:
        return AnthropicClaude(anthropic.Anthropic(api_key=key)), "AI help: your API key"
    if which(CLAUDE_EXE):
        return ClaudeCodeClaude(), "AI help: your Claude Code login"
    return NoClaude(), "AI help: none (log in to Claude Code, or save an API key)"


def build_app(root: Path, web: Path = DEFAULT_WEB, claude: ClaudeClient | None = None) -> FastAPI:
    """The API over the data folder `root`, plus the frontend build at `/` when
    `web/index.html` exists."""
    application = create_app(root, claude=claude)
    if (web / "index.html").exists():
        application.mount("/", StaticFiles(directory=web, html=True), name="web")
    else:
        @application.get("/")
        def placeholder():
            return {"message": f"paperboard API is running, but no web build was found at {web}. "
                               "Run `cd web && npm run build`, or pass --web <folder>."}
    return application


@app.command("extract")
def extract_command(
    pdf: Path = typer.Argument(..., help="The PDF to read."),
    out: Path = typer.Option(Path("papers"), "--out", help="Where board folders live."),
) -> None:
    """Write <out>/<paper-id>/{paper.pdf,source.json}."""
    if not pdf.is_file():
        typer.echo(f"error: {pdf} not found", err=True)
        raise typer.Exit(code=1)

    try:
        document = extract(pdf)
    except Exception as error:  # surface the extractor's own message, do not swallow it
        typer.echo(f"error: could not extract {pdf.name}: {error}", err=True)
        raise typer.Exit(code=2) from error

    # Both files every time, each atomically: a newer arXiv version shares the
    # paper id, and the folder's PDF and source must describe one file.
    folder = out / document.paper_id
    atomic_write(folder / "paper.pdf", pdf.read_bytes())
    atomic_write(folder / "source.json", document.model_dump_json(indent=2, by_alias=True).encode("utf-8"))
    typer.echo(
        f"{document.paper_id}: {len(document.sections)} sections, "
        f"{len(document.figures)} figures"
    )


@app.command("serve")
def serve_command(
    root: Path = typer.Option(Path("."), "--root", help="Data folder holding papers/ and tags.json."),
    web: Path = typer.Option(DEFAULT_WEB, "--web", help="Frontend build folder (web/dist)."),
    port: int = typer.Option(DEFAULT_PORT, "--port", help="Local port."),
) -> None:
    """Run the local server on 127.0.0.1 only."""
    import uvicorn

    typer.echo(f"paperboard at http://{HOST}:{port}  (data: {root.resolve()}, web: {web.resolve()})")
    claude, which_claude = choose_claude(os.environ)
    typer.echo(which_claude)
    uvicorn.run(build_app(root, web, claude), host=HOST, port=port, log_level="warning")
