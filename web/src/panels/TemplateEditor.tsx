import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Slot } from "../model/types";
import { BLANK_SLOT, cleanTemplate, setSlot, withoutSlot } from "./template";

export const TEMPLATE_FAILED_MESSAGE = "Could not load or save the template.";
export const TEMPLATE_SAVED_MESSAGE = "Saved. Papers opened for the first time from now on start with these slots.";

/** The slots a new board starts with (D17), global like the tags. Questions about papers in general, written once. */
export function TemplateEditor() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fail = (failure: unknown) => { console.error(TEMPLATE_FAILED_MESSAGE, failure); setStatus(TEMPLATE_FAILED_MESSAGE); };
  useEffect(() => { api.getTemplate().then((t) => setSlots(t.slots), fail); }, []);
  const save = async () => {
    if (!slots) return;
    try { setSlots((await api.putTemplate(cleanTemplate(slots))).slots); setStatus(TEMPLATE_SAVED_MESSAGE); } catch (failure) { fail(failure); }
  };
  if (!slots) return <section className="template-editor"><p className="hint">{status ?? "Loading the template"}</p></section>;
  return (
    <section className="template-editor" aria-label="Template">
      <h3>Template</h3>
      <p className="hint">The slots a new board starts with, three to a row. Boards you have already opened keep theirs.</p>
      <ol>
        {slots.map((slot, i) => (
          <li key={i}>
            <input aria-label={`Slot ${i + 1} name`} value={slot.name} onChange={(e) => setSlots(setSlot(slots, i, { name: e.target.value }))} />
            <textarea aria-label={`Slot ${i + 1} question`} value={slot.prompt} onChange={(e) => setSlots(setSlot(slots, i, { prompt: e.target.value }))} />
            <div className="row-tools">
              <button type="button" aria-label="Delete slot" onClick={() => setSlots(withoutSlot(slots, i))}>×</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="row-tools">
        <button type="button" onClick={() => setSlots([...slots, BLANK_SLOT])}>Add slot</button>
        <button type="button" onClick={() => void save()}>Save template</button>
      </div>
      {status && <p className="hint" role="status">{status}</p>}
    </section>
  );
}
