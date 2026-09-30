import { TRAYS_ENABLED } from "../model/tray";
import type { Command } from "./registry";

export type Panel = "questions" | "glossary" | "keySentences" | "export" | "tags" | "template";
export type ShellDeps = { openPanel: (panel: Panel) => void; newNote: () => void; find: () => void; split: () => void; shortcuts: () => void };

/** Every command ⌘K lists (spec A1), in this order; features such as AI help add theirs through the registry.
 *  "Add missing sections" fills the tray, so it is listed only while trays are on. */
export function shellCommands(d: ShellDeps, trays = TRAYS_ENABLED): Command[] {
  const commands: Command[] = [
    { id: "export", label: "Export", run: () => d.openPanel("export") },
    { id: "tags", label: "Tags", keywords: "colours", run: () => d.openPanel("tags") },
    { id: "template", label: "Template", keywords: "slots questions", run: () => d.openPanel("template") },
    { id: "split", label: "Add missing sections", keywords: "split tray", title: "Add every section and figure the board does not have yet, into the tray", run: d.split },
    { id: "new-note", label: "New note", keywords: "write", run: d.newNote },
    { id: "find", label: "Find in paper", keywords: "search", run: d.find },
    { id: "shortcuts", label: "Shortcuts", keywords: "keys gestures help ?", run: d.shortcuts },
  ];
  return trays ? commands : commands.filter((c) => c.id !== "split");
}
