import type {
  Board, ExportOrder, ExportResult, PageRect, PaperSummary, Question, ReextractResult, Selection, SelectionMode, Source, SplitDraft, TagFile,
  TemplateFile,
} from "../model/types";

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

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  return parse<T>(await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } }));
}

const send = <T>(method: string, path: string, body?: unknown) =>
  call<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

const paper = (id: string) => `/api/papers/${id}`;

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
    return parse<AddPaperResult>(await fetch("/api/papers", { method: "POST", body: form }));
  },
  getSource: (id: string) => call<Source>(`${paper(id)}/source`),
  reextract: (id: string) => send<ReextractResult>("POST", `${paper(id)}/extract`),
  pdfUrl: (id: string) => `${paper(id)}/pdf`,

  getBoard: (id: string) => call<Board>(`${paper(id)}/board`),
  async putBoard(id: string, board: Board, version: number): Promise<{ version: number } | { conflict: true; current: number }> {
    const response = await fetch(`${paper(id)}/board`, {
      method: "PUT", headers: { "content-type": "application/json", "If-Match": String(version) }, body: JSON.stringify(board),
    });
    const body = await response.json();
    if (response.status === 409) return { conflict: true, current: body.error.current };
    if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "unknown", body?.error?.message ?? "");
    return { version: body.version };
  },

  async getNote(id: string, nodeId: string): Promise<{ markdown: string }> {
    try {
      return await call<{ markdown: string }>(`${paper(id)}/notes/${nodeId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return { markdown: "" };   // a note never written is empty
      throw error;
    }
  },
  putNote: (id: string, nodeId: string, markdown: string) => send<void>("PUT", `${paper(id)}/notes/${nodeId}`, { markdown }),

  postText: (id: string, rects: PageRect[], snap: boolean, mode: SelectionMode = "text") =>
    send<Selection>("POST", `${paper(id)}/text`, { rects, snap, mode }),

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
  postExport: (id: string, tags: string[], order: ExportOrder = "paper") =>
    send<ExportResult>("POST", `${paper(id)}/export`, { tags, order }),

  getTags: () => call<TagFile>("/api/tags"),
  putTags: (tags: TagFile) => send<TagFile>("PUT", "/api/tags", tags),
  getTemplate: () => call<TemplateFile>("/api/template"),
  putTemplate: (template: TemplateFile) => send<TemplateFile>("PUT", "/api/template", template),
};
