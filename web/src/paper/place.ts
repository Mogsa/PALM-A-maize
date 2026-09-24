export const POPOVER_MARGIN = 8;
export const POPOVER_GAP = 6;

/** Keep a popover on screen: right of and below its anchor, above it near the bottom, never past the right edge. */
export function popoverPlace(at: DOMRect, width: number, height: number): { left: number; top: number } {
  const left = Math.max(POPOVER_MARGIN, Math.min(at.right + POPOVER_MARGIN, window.innerWidth - width - POPOVER_MARGIN));
  const below = at.bottom + POPOVER_GAP;
  const top = below + height <= window.innerHeight ? below : Math.max(POPOVER_MARGIN, at.top - height - POPOVER_GAP);
  return { left, top };
}
