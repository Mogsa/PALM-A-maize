/** A PDF destination is [page ref, {name}, ...args] in PDF user space, origin bottom-left. The top of the view it asks
 *  for, as a y from the page's top edge in page space (addendum 2), or null for "the page itself" (D10). */
export function destinationTop(dest: unknown, pageHeight: number): number | null {
  if (!Array.isArray(dest) || dest.length < 2) return null;
  const kind = (dest[1] as { name?: string } | null)?.name;
  const top = kind === "XYZ" ? dest[3] : kind === "FitH" || kind === "FitBH" ? dest[2] : kind === "FitR" ? dest[5] : null;
  if (typeof top !== "number") return null;
  return Math.min(Math.max(pageHeight - top, 0), pageHeight);
}
