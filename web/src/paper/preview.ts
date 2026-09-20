export const PREVIEW_CHARS = 90;

/** One line of the selected text for the popover, so the reader sees what a cut or
 *  highlight will hold before choosing. Browser selections follow the PDF's internal
 *  order, which on some papers pulls in a footer between two columns; seeing it here
 *  is how the reader notices. */
export function previewText(text: string, max: number = PREVIEW_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : cut).trimEnd() + "…";
}
