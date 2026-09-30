"""`papers/<id>/activity.jsonl` (activity log spec): what the reader did, one
event per line, appended only. The server checks the shape and nothing more:
which actions exist and what their details hold is the client's business."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_EVENTS = 200                  # per request
MAX_ACTIVITY_BYTES = 64 * 1024    # per request body
MAX_ACTION_CHARS = 32
DEFAULT_READ_LIMIT = 500
MAX_READ_LIMIT = 5000


class ActivityEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    t: datetime   # the client's time when it happened
    kind: Literal["session", "build", "read", "ai"]
    action: str = Field(min_length=1, max_length=MAX_ACTION_CHARS)
    detail: dict[str, Any]


class ActivityBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[ActivityEvent] = Field(max_length=MAX_EVENTS)
