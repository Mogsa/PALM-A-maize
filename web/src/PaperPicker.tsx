import { useRef, useState } from "react";
import { api, ApiError, type AddPaperResult } from "./api/client";
import type { PaperSummary } from "./model/types";

/** The picker's last entry: not a paper, it opens the file chooser. */
export const ADD_PAPER = "__add_paper__";

const ADD_FAILED: Record<number, string> = { 415: "That file is not a PDF.", 413: "That PDF is too large." };
const READ_FAILED = "Could not read that PDF.";

type Status = { kind: "busy" | "done"; text: string } | { kind: "error"; text: string } | null;

/** A re-upload re-anchors what the reader made (D9): how many things moved, and how many could not be placed. */
export function reuploadSummary({ changed = [], states = {} }: AddPaperResult): string {
  const lost = Object.values(states).filter((s) => s === "orphaned").length;
  return `Updated this paper: ${changed.length} changed, ${lost} could not be placed.`;
}

function failureText(failure: unknown): string {
  return (failure instanceof ApiError && ADD_FAILED[failure.status]) || READ_FAILED;
}

type Props = { papers: PaperSummary[]; value: string; onChange: (id: string) => void; onAdded: (id: string) => void };

/** Chooses the open paper; its last entry adds one from a PDF, so adding is not another button in the bar. */
export function PaperPicker({ papers, value, onChange, onAdded }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);
  const upload = async (pdf: File) => {
    setStatus({ kind: "busy", text: `Adding ${pdf.name}…` });
    try {
      const result = await api.addPaper(pdf, pdf.name);
      setStatus(result.changed ? { kind: "done", text: reuploadSummary(result) } : null);
      onAdded(result.paper_id);
    } catch (failure) {
      console.error("Could not add the paper", failure);
      setStatus({ kind: "error", text: failureText(failure) });
    }
  };
  const choose = (id: string) => {
    if (id !== ADD_PAPER) return onChange(id);
    setStatus(null);
    file.current?.click();
  };
  return (
    <>
      <select value={value} onChange={(e) => choose(e.target.value)} aria-label="Paper" disabled={status?.kind === "busy"}>
        {value === "" && <option value="">Choose a paper</option>}
        {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
        <option value={ADD_PAPER}>Add paper…</option>
      </select>
      <input ref={file} type="file" accept=".pdf,application/pdf" hidden
             onChange={(e) => { const pdf = e.target.files?.[0]; e.target.value = ""; if (pdf) void upload(pdf); }} />
      {status && <span className={`picker-status ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>{status.text}</span>}
    </>
  );
}
