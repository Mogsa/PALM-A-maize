import type { Board, PageRect, PaperSummary, Selection, Source } from "../model/types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    const error = body?.error ?? { code: "unknown", message: response.statusText };
    throw new ApiError(response.status, error.code, error.message);
  }
  return body as T;
}

export const api = {
  listPapers: () => call<PaperSummary[]>("/api/papers"),
  getSource: (id: string) => call<Source>(`/api/papers/${id}/source`),
  getBoard: (id: string) => call<Board>(`/api/papers/${id}/board`),
  pdfUrl: (id: string) => `/api/papers/${id}/pdf`,

  async putBoard(id: string, board: Board, version: number): Promise<{ version: number } | { conflict: true; current: number }> {
    const response = await fetch(`/api/papers/${id}/board`, {
      method: "PUT", headers: { "content-type": "application/json", "If-Match": String(version) }, body: JSON.stringify(board),
    });
    const body = await response.json();
    if (response.status === 409) return { conflict: true, current: body.error.current };
    if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "unknown", body?.error?.message ?? "");
    return { version: body.version };
  },

  postText: (id: string, rects: PageRect[], snap: boolean) =>
    call<Selection>(`/api/papers/${id}/text`, { method: "POST", body: JSON.stringify({ rects, snap }) }),
};
