# Activity log: a record of what the reader does

30 September 2026. Agreed with the owner the same day. The first part of the study layer.

## Goal, in one sentence

Every paper keeps a plain, local, append-only record of what the reader did (built, read, asked the AI),
which the reader can see at any time, so it can be analysed later and, in a later step, tried as context for
an LLM that helps them read.

## Decisions (owner, 30 Sep)

- **On by default**, per paper, switchable off in ⌘K ("Turn activity log off/on"). Kept in `view.json` as
  `log: boolean` (default true). Off means the client sends nothing; entries already written stay.
- **The words are included**: a highlight's quote, a note's text, a Define's word.
- **An Activity panel** in v1: ⌘K → "Activity" lists the log in plain words, newest first.
- Not in v1: feeding the log to an LLM. First collect real logs, then test that idea offline.

## Not recorded

Mouse movement, individual keystrokes, anything outside Paper Board. Nothing leaves the machine.

## File

`papers/<id>/activity.jsonl`, append-only, one JSON object per line, never rewritten:

```json
{"t": "2026-09-30T10:42:03.120Z", "kind": "build", "action": "note", "detail": {"id": "n-…", "text": "the learner drives…"}}
```

- `t`: the client's ISO time when it happened. `kind`: `"session" | "build" | "read" | "ai"`.
  `action`: a short verb (below). `detail`: a small object, only the fields listed.
- The server appends; it validates the shape (these four keys, `kind` one of the four, `action` a short
  string, `detail` an object, at most 200 events and 64 KB per request) and rejects anything else with 400.

### Actions

| kind | action | detail | when |
|---|---|---|---|
| session | `open` | `{}` | the paper is opened |
| session | `close` | `{}` | the page is hidden or another paper is chosen |
| build | `highlight` | `{id, text, tags}` | a highlight is added |
| build | `cut` | `{id, text}` | a chunk or figure is added from the paper (text: first 200 chars of its text, or the caption) |
| build | `note` | `{id, text, on}` | a note's text when editing ends (blur or close), only if it changed; `on`: the id it is connected to, if one |
| build | `connect` | `{id, from, to, tags}` | an edge is added |
| build | `group` | `{id, name, members}` | a group is created or pieces are grouped |
| build | `tag` | `{id, tags}` | tags change on a piece, mark or edge |
| build | `remove` | `{ids}` | things are deleted |
| build | `split` / `join` / `cutout` | `{ids}` | chunk reshapes |
| build | `undo` / `redo` | `{}` | |
| read | `view` | `{view}` | Paper, Both or Board chosen |
| read | `page` | `{page, seconds}` | the paper rested on a page for 2 s or more; sent when it moves on (page from 1) |
| read | `find` | `{text}` | Find in paper is run |
| ai | `on` / `off` | `{}` | AI help switched |
| ai | `define` | `{word}` | Define is asked |
| ai | `key-sentences` | `{}` | the Key sentences panel is opened |
| ai | `jump` | `{slot, text}` | a key sentence is clicked |
| ai | `keep` | `{slot, text}` | a key sentence or AI term is kept |

Moves and resizes of cards are not logged in v1 (noisy); the board itself keeps final positions.

## API

- `POST /api/papers/{id}/activity` with `{"events": [...]}` → 204. Requires the usual `X-Paperboard` header.
- `GET /api/papers/{id}/activity?limit=500` → `{"events": [...]}`, newest last, the last `limit` lines.
- A paper with no file returns `{"events": []}`.

## Client

- One small logger module: `log(kind, action, detail)` queues an event with its time; the queue is sent every
  5 s, when it reaches 50, and on `pagehide` (`fetch` with `keepalive: true`, so the header can be set).
  A failed send is kept and retried once on the next flush, then dropped with a console error (the log is a
  record, not the reader's work: it must never block or break reading).
- Board events come from the board's dispatch (one place), mapped by action type; view, find, AI and panel
  events are logged where they happen.
- Nothing is queued while `view.log` is false.
- **Activity panel** (⌘K → "Activity"): newest first, time, a plain sentence per event ("Highlighted
  “…”", "Wrote a note: “…”", "Asked AI to define “regret”", "Read page 4 for 38 s"), and the on/off state
  with the switch. It reads `GET /activity`.

## Testing

- pytest: append and read back; shape validation (bad kind, too many events, too large → 400); GET limit;
  missing file → empty; concurrent appends do not interleave lines.
- vitest: mapping of each reducer action to its event; nothing queued when off; batching and flush on
  pagehide; the note event only on edit end and only when changed; page dwell only after 2 s; the panel's
  sentences for each action.
- e2e: highlight, write a note, switch view, open the Activity panel: the three appear; turn it off, do
  something, nothing new appears; the file on disk has the lines.
