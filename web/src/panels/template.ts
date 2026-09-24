import type { Slot, TemplateFile } from "../model/types";

export const BLANK_SLOT: Slot = { name: "New slot", prompt: "" };

export function moveSlot(slots: Slot[], index: number, delta: -1 | 1): Slot[] {
  const to = index + delta;
  if (to < 0 || to >= slots.length) return slots;
  const next = [...slots];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export const setSlot = (slots: Slot[], index: number, patch: Partial<Slot>): Slot[] => slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
export const withoutSlot = (slots: Slot[], index: number): Slot[] => slots.filter((_, i) => i !== index);

/** What is saved: trimmed, and a slot needs a name (a group's name is what the grid shows). */
export function cleanTemplate(slots: Slot[]): TemplateFile {
  return { schema: 1, slots: slots.map((s) => ({ name: s.name.trim(), prompt: s.prompt.trim() })).filter((s) => s.name) };
}
