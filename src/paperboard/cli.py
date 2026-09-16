"""`paperboard extract` and `paperboard serve`."""

import shutil
from pathlib import Path

import typer
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from paperboard.api import create_app
from paperboard.extract import extract

HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_WEB = Path("web") / "dist"

app = typer.Typer(help="Take a paper apart so its ideas can be laid out.")


@app.callback()
def main() -> None:
    """paperboard: take a paper apart so its ideas can be laid out.

    A no-op callback. Without it, a Typer app with exactly one registered
    command collapses to that command directly, so `paperboard extract
    file.pdf` would parse "extract" as the pdf argument instead of
    dispatching the extract command (Ruling F4).
    """


def build_app(root: Path, web: Path = DEFAULT_WEB) -> FastAPI:
    """The API over the data folder `root`, plus the frontend build at `/` when
    `web/index.html` exists."""
    application = create_app(root)
    if (web / "index.html").exists():
        application.mount("/", StaticFiles(directory=web, html=True), name="web")
    else:
        @application.get("/")
        def placeholder():
            return {"message": "paperboard API is running; the web build is not present"}
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

    folder = out / document.paper_id
    folder.mkdir(parents=True, exist_ok=True)
    if not (folder / "paper.pdf").exists():
        shutil.copy2(pdf, folder / "paper.pdf")
    (folder / "source.json").write_text(
        document.model_dump_json(indent=2, by_alias=True), encoding="utf-8"
    )
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
    uvicorn.run(build_app(root, web), host=HOST, port=port, log_level="warning")
