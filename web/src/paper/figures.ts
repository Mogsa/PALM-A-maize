import { lineInside } from "../model/geometry";
import type { Figure, PageRect, Source } from "../model/types";

/** The figure a snapped rectangle took (addendum 5.3): its picture's midpoint inside, and its caption's too when
 *  it has one, since the snap takes a figure with its caption. */
export function pairedFigure(source: Source, snapped: PageRect): Figure | null {
  return source.figures.find((f) => lineInside(f.rect, [snapped]) && (!f.caption_rect || lineInside(f.caption_rect, [snapped]))) ?? null;
}
