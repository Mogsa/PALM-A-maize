"""`paperboard extract` — the only command in this plan."""

import shutil
from pathlib import Path

import typer

from paperboard.extract import extract

app = typer.Typer(help="Take a paper apart so its ideas can be laid out.")


@app.callback()
def main() -> None:
    """paperboard: take a paper apart so its ideas can be laid out.

    A no-op callback. Without it, a Typer app with exactly one registered
    command collapses to that command directly, so `paperboard extract
    file.pdf` would parse "extract" as the pdf argument instead of
    dispatching the extract command (Ruling F4).
    """


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
