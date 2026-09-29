/** Input types that take typed text. A checkbox, radio, button, range or colour input has no undo of its own,
 *  so the board's undo must still reach it. */
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "number", "password", "tel"]);

/** Keys typed into a text field belong to it: its own undo, its own Delete (addendum 4.7). jsdom has no
 *  isContentEditable, so the attribute is read as well. */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.getAttribute("contenteditable") === "true") return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return ["TEXTAREA", "SELECT"].includes(target.tagName);
}

/** In the both view the paper and the board share one Delete key. While a paper popover is open (a mark's, which
 *  Delete removes, or a selection's choice) or text on the paper is selected, the key is the paper's: the board
 *  must not also remove its selected cards. */
export function paperHoldsDelete(doc: Document): boolean {
  if (doc.querySelector(".paper-pane .popover")) return true;
  const selection = doc.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode) return false;
  const at = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement;
  return at?.closest(".paper-pane") != null;
}
