"""The grounding rule (spec B3a), in one place, for both tiers: a claim stays
only if it names a span that exists and quotes a real run of that span's words,
whole words and at least MIN_QUOTE_WORDS of them. The AI cannot point at text
the paper does not have."""

import re
import unicodedata

from pydantic import BaseModel, ValidationError

from paperboard.ai_model import MAX_SLOT_SPANS, AiTerm, Ground, SlotSpans
from paperboard.source_model import PageRect
from paperboard.spans import Span

# The fewest words a quote may have: shorter, "we" or "cause" would ground almost any claim.
MIN_QUOTE_WORDS = 3

_LINE_HYPHEN = re.compile(r"-\s*\n\s*")
_SPACE = re.compile(r"\s+")


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return _SPACE.sub(" ", _LINE_HYPHEN.sub("", text)).strip()


def _quotes(quote: str, text: str) -> bool:
    """True when the normalised quote is at least MIN_QUOTE_WORDS words and sits in the
    normalised text at word boundaries: "cause" is not a quote of "because"."""
    if len(quote.split()) < MIN_QUOTE_WORDS:
        return False
    return re.search(rf"(?<!\w){re.escape(quote)}(?!\w)", text) is not None


def _grounded(item: Ground, spans: dict[str, Span]) -> Ground | None:
    """The ground with its span's rect, or None when the span is unknown or the quote fails _quotes."""
    span = spans.get(item.span)
    if span is None or not _quotes(normalise(item.quote), normalise(span.text)):
        return None
    return Ground(span=span.id, quote=item.quote, at=PageRect(page=span.page, rect=span.rect))


def ground_all(items: list[dict], spans: dict[str, Span]) -> list[Ground]:
    """Only the grounds whose quote is a whole-word run of at least MIN_QUOTE_WORDS words of a span that exists."""
    out = []
    for raw in items:
        kept = _grounded(Ground.model_validate(raw), spans)
        if kept:
            out.append(kept)
    return out


class _RawTerm(BaseModel):
    term: str
    defined_in: list[dict] = []
    explanation: str = ""
    grounds: list[dict] = []


class _RawSlot(BaseModel):
    slot: str
    spans: list[dict] = []


class _RawPass(BaseModel):
    terms: list[_RawTerm] = []
    where_to_look: list[_RawSlot] = []


def _term(raw: _RawTerm, spans: dict[str, Span]) -> AiTerm | None:
    defined_in, grounds = ground_all(raw.defined_in, spans), ground_all(raw.grounds, spans)
    if not defined_in and not grounds:
        return None
    return AiTerm(term=raw.term.strip(), defined_in=defined_in, grounds=grounds,
                  explanation=raw.explanation.strip() if grounds and raw.explanation.strip() else None)


def _each_span_once(grounds: list[Ground]) -> list[Ground]:
    """The first ground for each span, in order: a slot pointing at one span twice points at it once."""
    first: dict[str, Ground] = {}
    for ground in grounds:
        first.setdefault(ground.span, ground)
    return list(first.values())


def ground_pass(raw: dict, spans: dict[str, Span], slot_names: list[str]) -> tuple[list[AiTerm], list[SlotSpans]]:
    """The model's answer with everything that fails the rule dropped. A wrong
    shape is a ValueError: the output is invalid, not partly true."""
    try:
        parsed = _RawPass.model_validate(raw)
    except ValidationError as exc:
        raise ValueError(f"the answer was not in the expected shape: {exc.errors()[0]['msg']}") from exc
    terms = [t for t in (_term(r, spans) for r in parsed.terms) if t]
    where = []
    for slot in parsed.where_to_look:
        kept = _each_span_once(ground_all(slot.spans, spans))[:MAX_SLOT_SPANS]
        if slot.slot in slot_names and kept:
            where.append(SlotSpans(slot=slot.slot, spans=kept))
    return terms, where
