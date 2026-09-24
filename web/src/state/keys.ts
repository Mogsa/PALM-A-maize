/** Keys typed into a text field belong to it: its own undo, its own Delete (addendum 4.7). jsdom has no
 *  isContentEditable, so the attribute is read as well. */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.getAttribute("contenteditable") === "true") return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
