import { expect, type APIRequestContext } from "@playwright/test";

/** What the server requires on every write (contract 2), for the specs' own PUTs and POSTs. The browser's requests
 *  must carry it by themselves: it is never set for the whole context, or a client that forgot it would still pass. */
export const WRITE = { "X-Paperboard": "1" } as const;

/** Resets a paper's view state (view, scrolls, filter and split live at /view, not in the board), with `view` applied
 *  on top. A spec that starts from a known board must also start from a known view. */
export async function putView(request: APIRequestContext, paperId: string, view: Record<string, unknown> = {}) {
  const body = { view: "paper", paper_scroll: null, active_tags: [], viewport: null, split: 0.4, ...view };
  const put = await request.put(`/api/papers/${paperId}/view`, { data: body, headers: WRITE });
  expect(put.ok()).toBeTruthy();
}

export const viewOf = async (request: APIRequestContext, paperId: string) => (await request.get(`/api/papers/${paperId}/view`)).json();
