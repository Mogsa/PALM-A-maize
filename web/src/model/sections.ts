import { lineInside } from "./geometry";
import type { PageRect, Section, Source } from "./types";

/** The section a line or rect starts in: the one whose extent holds its midpoint (addendum 4.0's test). Extents run
 *  from one heading to the next, so they do not nest and the first match is the only one. */
export function sectionAt(source: Source, at: PageRect): Section | null {
  return source.sections.find((s) => lineInside(at, s.extent)) ?? null;
}

const number = (s: Section) => (s.number ?? "").replace(/\.$/, "");

/** "§3" for a numbered section, its title otherwise: the short name a margin chip uses. */
export function sectionRef(s: Section): string {
  return number(s) ? `§${number(s)}` : s.title;
}

/** "§3 Model Architecture": the name a tray ghost row uses. */
export function sectionLabel(s: Section): string {
  return number(s) ? `§${number(s)} ${s.title}` : s.title;
}
