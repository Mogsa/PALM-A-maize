/** What the server requires on every write (contract 2), for the specs' own PUTs and POSTs. The browser's requests
 *  must carry it by themselves: it is never set for the whole context, or a client that forgot it would still pass. */
export const WRITE = { "X-Paperboard": "1" } as const;
