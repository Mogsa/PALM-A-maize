"""A note's sketch (D23): freehand strokes kept for re-editing, and an SVG of
their outlines for showing and exporting.

The client sends each outline as an SVG path's `d` string, never as markup.
Each string is checked to be path syntax and nothing else before the server
writes it into an attribute, so no element or script can reach the file."""

import re
from xml.sax.saxutils import quoteattr

from pydantic import BaseModel, Field, field_validator

MAX_SIDE = 4000          # a sketch's width or height, in its own units
MAX_STROKES = 5000
MAX_POINTS = 20_000      # in one stroke
MAX_PATH_CHARS = 200_000  # in one outline's `d` string
INK = "#1b1f24"          # the app's --ink
# Path command letters, numbers (with a minus, a dot, an exponent), commas and spaces. No quote, bracket, `<`, `&`
# or any letter that is not a command, so a string that passes cannot close the attribute it is written into.
_PATH_D = re.compile(r"[MmLlHhVvCcSsQqTtAaZz0-9eE.,\- ]*")


class Stroke(BaseModel):
    points: list[tuple[float, float, float]] = Field(max_length=MAX_POINTS)   # x, y, pressure
    size: float = Field(gt=0)


class SketchFile(BaseModel):
    """What `notes/<id>.sketch.json` holds: enough to draw the strokes again."""
    width: int = Field(gt=0, le=MAX_SIDE)
    height: int = Field(gt=0, le=MAX_SIDE)
    strokes: list[Stroke] = Field(max_length=MAX_STROKES)


class SketchBody(SketchFile):
    """A PUT: the strokes, and each stroke's outline as a path's `d` string."""
    paths: list[str] = Field(max_length=MAX_STROKES)

    @field_validator("paths")
    @classmethod
    def _only_path_syntax(cls, paths: list[str]) -> list[str]:
        for d in paths:
            if len(d) > MAX_PATH_CHARS or not _PATH_D.fullmatch(d):
                raise ValueError("a sketch path must be SVG path data only")
        return paths


def sketch_svg(width: int, height: int, paths: list[str]) -> str:
    """An `<svg>` of filled `<path>`s and nothing else."""
    body = "".join(f"<path d={quoteattr(d)}/>" for d in paths)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" fill="{INK}">{body}</svg>\n')
