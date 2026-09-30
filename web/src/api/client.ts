import type {
  Board, ChunkAnchor, ExportResult, HighlightAnchor, JoinResult, NoteFile, PageRect, PaperSummary, Piece, Question, QuoteSelector,
  RecutMode, ReextractResult, Selection, SelectionMode, Sketch, SketchUpload, Source, SplitDraft, TagFile, TemplateFile,
} from "../model/types";
import type { PaperViewState } from "../model/paperView";
import type { AskAnswer, AskRequest, SavedTurn } from "../ai/ask/types";
import type { AiStatus, DefineRequest, Definition } from "../ai/types";
import { NO_AI } from "../ai/types";
import { readNdjson } from "../ai/ndjson";
import type { ActivityEvent } from "../activity/types";
import type { AgentNote } from "../agent/agentNotes";

/** One method per route of SPEC-ADDENDUM.md section 6. */

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    const error = body?.error ?? { code: "unknown", message: response.statusText };
    throw new ApiError(response.status, error.code, error.message);
  }
  return body as T;
}

/** Sent on every request. The server refuses a write without it, and a custom header makes any other origin's
 *  request need a CORS preflight the server never grants, so no other page can write here (contract 2). */
export const PAPERBOARD_HEADERS: Record<string, string> = { "X-Paperboard": "1" };

/** fetch with PAPERBOARD_HEADERS added; `headers` must be a plain object. */
function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, { ...init, headers: { ...PAPERBOARD_HEADERS, ...(init.headers as Record<string, string> | undefined) } });
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  return parse<T>(await request(path, { ...init, headers: { "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) } }));
}

const send = <T>(method: string, path: string, body?: unknown) =>
  call<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

const paper = (id: string) => `/api/papers/${id}`;

/** POSTs `body` and reads the NDJSON answer: `onDelta` gets the model's raw text as it comes, then the result. */
async function streamed<T>(path: string, body: unknown, onDelta: (text: string) => void): Promise<T> {
  const response = await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) await parse(response);   // throws ApiError with the server's code
  let result: T | null = null;
  let failure: string | null = null;
  await readNdjson(response, (raw) => {
    const line = raw as { delta: string } | { done: T } | { error: string };
    if ("delta" in line) onDelta(line.delta);
    else if ("done" in line) result = line.done;
    else failure = line.error;
  });
  if (failure || !result) throw new Error(failure ?? "AI help could not run: the answer stopped early");
  return result;
}

/** Clips render at three times the page's 72 dpi, so an equation stays sharp (addendum 5.3). */
export const CLIP_DPI = 216;

export type AddPaperResult = { paper_id: string } & Partial<ReextractResult>;
export type ClipResult = { clip: string; clip_size: { width: number; height: number } };

export const api = {
  listPapers: () => call<PaperSummary[]>("/api/papers"),
  /** Multipart, so the browser sets the content type and its boundary. */
  async addPaper(pdf: Blob, filename: string): Promise<AddPaperResult> {
    const form = new FormData();
    form.append("file", pdf, filename);
    const response = await request("/api/papers", { method: "POST", body: form });
    if (response.ok) return response.json();
    // A 413 may come from a proxy with no JSON body; a failure may be `{error: {code}}` or a bare `{code}`.
    const body = await response.json().catch(() => null);
    const error = body?.error ?? body ?? {};
    throw new ApiError(response.status, error.code ?? "unknown", error.message ?? response.statusText);
  },
  getSource: (id: string) => call<Source>(`${paper(id)}/source`),
  reextract: (id: string) => send<ReextractResult>("POST", `${paper(id)}/extract`),
  pdfUrl: (id: string) => `${paper(id)}/pdf`,

  getBoard: (id: string) => call<Board>(`${paper(id)}/board`),
  async putBoard(id: string, board: Board, version: number): Promise<{ version: number } | { conflict: true; current: number }> {
    const response = await request(`${paper(id)}/board`, {
      method: "PUT", headers: { "content-type": "application/json", "If-Match": String(version) }, body: JSON.stringify(board),
    });
    const body = await response.json();
    if (response.status === 409) return { conflict: true, current: body.error.current };
    if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "unknown", body?.error?.message ?? "");
    return { version: body.version };
  },

  /** View state: no version and no If-Match; the latest PUT wins. */
  getView: (id: string) => call<PaperViewState>(`${paper(id)}/view`),
  putView: (id: string, view: PaperViewState) => send<void>("PUT", `${paper(id)}/view`, view),

  async getNote(id: string, nodeId: string): Promise<NoteFile> {
    try {
      const note = await call<{ markdown: string; has_sketch?: boolean }>(`${paper(id)}/notes/${nodeId}`);
      return { markdown: note.markdown, has_sketch: note.has_sketch ?? false };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return { markdown: "", has_sketch: false };   // a note never written is empty
      throw error;
    }
  },
  putNote: (id: string, nodeId: string, markdown: string) => send<void>("PUT", `${paper(id)}/notes/${nodeId}`, { markdown }),

  /** A note's sketch (D23). The server builds its SVG from `paths`, which must be SVG path data and nothing else. */
  putSketch: (id: string, nodeId: string, sketch: SketchUpload) => send<void>("PUT", `${paper(id)}/notes/${nodeId}/sketch`, sketch),
  getSketch: (id: string, nodeId: string) => call<Sketch>(`${paper(id)}/notes/${nodeId}/sketch`),
  deleteSketch: (id: string, nodeId: string) => send<void>("DELETE", `${paper(id)}/notes/${nodeId}/sketch`),
  /** `version` changes after every save, so the browser never shows a sketch it cached before. */
  sketchUrl: (id: string, nodeId: string, version: number) => `${paper(id)}/notes/${nodeId}/sketch.svg?v=${version}`,

  /** `lines`, a text selection's rects one per printed line, is what the highlight paints (contract 1); an older
   *  server ignores it. */
  postText: (id: string, rects: PageRect[], snap: boolean, mode: SelectionMode = "text", lines?: PageRect[]) =>
    send<Selection>("POST", `${paper(id)}/text`, { rects, snap, mode, ...(lines ? { lines } : {}) }),

  /** Renders and stores a figure's clip. */
  putClip: (id: string, nodeId: string, target: PageRect, dpi = CLIP_DPI) =>
    send<ClipResult>("PUT", `${paper(id)}/clips/${nodeId}`, { ...target, dpi }),
  clipUrl: (id: string, nodeId: string) => `${paper(id)}/clips/${nodeId}.png`,
  /** A stateless render of a rect of the paper, for a chunk's clip blocks; cached by the browser by ETag. */
  renderUrl(id: string, { page, rect: [x0, y0, x1, y1] }: PageRect, dpi = CLIP_DPI): string {
    const query = new URLSearchParams({ page: String(page), x0: String(x0), y0: String(y0), x1: String(x1), y1: String(y1), dpi: String(dpi) });
    return `${paper(id)}/render?${query}`;
  },

  getQuestions: (id: string) => call<Question[]>(`${paper(id)}/questions`),
  split: (id: string) => send<{ nodes: SplitDraft[] }>("POST", `${paper(id)}/split`),
  /** Words selected on a card, found inside the chunk's region (addendum 4.10). Words not there throw `quote_not_found`. */
  highlightInChunk: async (id: string, region: ChunkAnchor, quote: QuoteSelector): Promise<HighlightAnchor> =>
    (await send<{ highlight: HighlightAnchor }>("POST", `${paper(id)}/chunks/highlight`, { region, quote })).highlight,
  /** Split here or Cut out: the chunk's pieces in paper order; fewer than two means nothing to divide. */
  recut: async (id: string, region: ChunkAnchor, at: QuoteSelector, mode: RecutMode): Promise<Piece[]> =>
    (await send<{ nodes: Piece[] }>("POST", `${paper(id)}/chunks/split`, { region, at, mode })).nodes,
  /** Join: the joined piece and the paper order of `regions`, or null when they are not neighbours in the paper. */
  async join(id: string, regions: ChunkAnchor[]): Promise<JoinResult | null> {
    try {
      return await send<JoinResult>("POST", `${paper(id)}/chunks/join`, { regions });
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_contiguous") return null;
      throw error;
    }
  },
  /** The export is always in the paper's order. */
  postExport: (id: string, tags: string[]) =>
    send<ExportResult>("POST", `${paper(id)}/export`, { tags, order: "paper" }),

  /** The AI pass and its status (spec B3); no pass yet is `NO_AI`, not an error. */
  async getAi(id: string): Promise<AiStatus> {
    try {
      return await call<AiStatus>(`${paper(id)}/ai`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "ai_not_found") return NO_AI;
      throw error;
    }
  },
  runAi: (id: string) => send<AiStatus>("POST", `${paper(id)}/ai`),
  /** A quick definition, streamed: `onDelta` gets the model's raw text as it comes. */
  define: (id: string, body: DefineRequest, onDelta: (text: string) => void) =>
    streamed<Definition>(`${paper(id)}/ai/define`, body, onDelta),
  /** A question about the paper (Ask spec), streamed as Define is. */
  ask: (id: string, body: AskRequest, onDelta: (text: string) => void) =>
    streamed<AskAnswer>(`${paper(id)}/ai/ask`, body, onDelta),
  /** The reader's layer exactly as a question sends it (Show what's sent). */
  askContext: async (id: string) => (await call<{ text: string }>(`${paper(id)}/ai/ask/context`)).text,
  /** The latest saved chat: the turns after the last New chat, oldest first. */
  getChat: async (id: string) => (await call<{ turns: SavedTurn[] }>(`${paper(id)}/ai/ask/chat`)).turns,
  /** New chat: a divider line in chat.jsonl; the file keeps every chat. */
  newChat: (id: string) => call<void>(`${paper(id)}/ai/ask/new`, { method: "POST" }),

  /** Appends to the paper's activity log (activity log spec). `keepalive` lets a send on pagehide outlive the page;
   *  fetch, not sendBeacon, so the Paperboard header goes too. */
  postActivity: (id: string, events: ActivityEvent[], { keepalive = false }: { keepalive?: boolean } = {}) =>
    call<void>(`${paper(id)}/activity`, { method: "POST", keepalive, body: JSON.stringify({ events }) }),
  /** The log's last `limit` events, oldest first. */
  getActivity: async (id: string, limit: number): Promise<ActivityEvent[]> =>
    (await call<{ events: ActivityEvent[] }>(`${paper(id)}/activity?limit=${limit}`)).events,

  /** Notes an AI agent wrote into `papers/<id>/agent/`, newest first (bring-your-own-agent spec). */
  agentNotes: (id: string) => call<AgentNote[]>(`${paper(id)}/agent-notes`),
  /** The note is on the board now: the server moves its file into `agent/placed/`. */
  placeAgentNote: (id: string, file: string) => send<void>("POST", `${paper(id)}/agent-notes/${encodeURIComponent(file)}/placed`),

  getTags: () => call<TagFile>("/api/tags"),
  putTags: (tags: TagFile) => send<TagFile>("PUT", "/api/tags", tags),
  getTemplate: () => call<TemplateFile>("/api/template"),
  putTemplate: (template: TemplateFile) => send<TemplateFile>("PUT", "/api/template", template),
};
