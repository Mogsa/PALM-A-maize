"""`papers/<id>/ai.json` (spec B3a, B3b): generated, never hand-edited, never
exported. `reader` is the whole-paper pass; `defined` holds quick definitions,
keyed by the normalised word."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from paperboard.source_model import PageRect

AI_SCHEMA_VERSION = 1
MAX_SLOT_SPANS = 3


class Ground(BaseModel):
    span: str
    quote: str
    at: PageRect | None = None   # the span's rect, filled by grounding, for "based on p3" and outlines
    lines: list[PageRect] = []   # the quote's printed lines in reading order, for drawing it; empty when not found


class AiTerm(BaseModel):
    term: str
    defined_in: list[Ground] = []
    explanation: str | None = None
    grounds: list[Ground] = []
    occurrences: list[PageRect] = []


class SlotSpans(BaseModel):
    slot: str
    spans: list[Ground]


class ReaderPass(BaseModel):
    model: str
    made_at: datetime
    terms: list[AiTerm] = []
    where_to_look: list[SlotSpans] = []


class Definition(BaseModel):
    model: str
    explanation: str
    grounds: list[Ground]


class AiFile(BaseModel):
    schema_version: int = Field(default=AI_SCHEMA_VERSION, alias="schema")
    extracted_at: datetime
    reader: ReaderPass | None = None
    defined: dict[str, Definition] = {}

    model_config = {"populate_by_name": True}


class AiLogPrompt(BaseModel):
    system: str
    user: str


class AiLogError(BaseModel):
    code: str
    message: str


class AiLogEntry(BaseModel):
    """One line of `papers/<id>/ai-log.jsonl` (a call to Claude, never rewritten,
    only appended). `raw` is the model's answer text or JSON exactly as received;
    `grounded` is what survived grounding, or null; `error` is set only on failure."""

    time: datetime
    kind: Literal["read", "define"]
    model: str
    route: Literal["api", "claude-code", "canned"]
    prompt: AiLogPrompt
    raw: str | None = None
    grounded: Any | None = None
    error: AiLogError | None = None
    extracted_at: datetime


_GROUND = {
    "type": "object",
    "properties": {"span": {"type": "string"}, "quote": {"type": "string"}},
    "required": ["span", "quote"],
    "additionalProperties": False,
}

PASS_SCHEMA = {
    "type": "object",
    "properties": {
        "terms": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "term": {"type": "string"},
                "defined_in": {"type": "array", "items": _GROUND},
                "explanation": {"type": "string"},
                "grounds": {"type": "array", "items": _GROUND},
            },
            "required": ["term", "defined_in", "explanation", "grounds"],
            "additionalProperties": False,
        }},
        "where_to_look": {"type": "array", "items": {
            "type": "object",
            "properties": {"slot": {"type": "string"}, "spans": {"type": "array", "items": _GROUND}},
            "required": ["slot", "spans"],
            "additionalProperties": False,
        }},
    },
    "required": ["terms", "where_to_look"],
    "additionalProperties": False,
}

DEFINE_SCHEMA = {
    "type": "object",
    "properties": {"explanation": {"type": "string"}, "grounds": {"type": "array", "items": _GROUND}},
    "required": ["explanation", "grounds"],
    "additionalProperties": False,
}
