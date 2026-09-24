import { useState } from "react";
import { api } from "../api/client";
import type { ExportOrder, ExportResult } from "../model/types";
import { FLUSH_FAILED_MESSAGE, useBoard } from "../state/BoardProvider";

export const EXPORT_FAILED_MESSAGE = "Could not write the export. The board is unchanged.";
export const COPY_FAILED_MESSAGE = "Could not copy. Select the text below instead.";

/** The literature note (SPEC 6): in the paper's order or the template's (D19), filtered by the active tags. */
export function ExportDialog() {
  const { paperId, state, flush } = useBoard();
  const [order, setOrder] = useState<ExportOrder>("paper");
  const [result, setResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = state.board.active_tags;
  const fail = (message: string, failure: unknown) => { console.error(message, failure); setError(message); };
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      // export writes what is on screen, pending changes and note text included; the server reads what is saved
      try { await flush(); } catch (failure) { return fail(FLUSH_FAILED_MESSAGE, failure); }
      try { setResult(await api.postExport(paperId, active, order)); } catch (failure) { fail(EXPORT_FAILED_MESSAGE, failure); }
    } finally {
      setBusy(false);
    }
  };
  const copy = (markdown: string) => navigator.clipboard.writeText(markdown).catch((failure: unknown) => fail(COPY_FAILED_MESSAGE, failure));
  return (
    <section className="export-dialog" aria-label="Export">
      <h3>Export</h3>
      <label className="field">Order
        <select aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value as ExportOrder)}>
          <option value="paper">The paper's order</option>
          <option value="template">The template's questions</option>
        </select>
      </label>
      <p className="hint">{active.length ? "Only what the tag filter shows." : "The whole board."}</p>
      <button type="button" onClick={() => void run()} disabled={busy}>Write export</button>
      {error && <p className="panel-error" role="alert">{error}</p>}
      {result && (
        <div className="export-result">
          <p>Written to <code>{result.path}</code></p>
          {result.markdown !== undefined && <><button type="button" onClick={() => void copy(result.markdown!)}>Copy Markdown</button><pre>{result.markdown}</pre></>}
        </div>
      )}
    </section>
  );
}
