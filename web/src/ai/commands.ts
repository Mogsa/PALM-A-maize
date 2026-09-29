import type { Command } from "../commands/registry";

/** AI help's entries in ⌘K (spec B2, B3a). "Redo AI pass" only while it is on. */
export function aiCommands({ on, setOn, redo }: { on: boolean; setOn: (on: boolean) => void; redo: () => void }): Command[] {
  if (!on) return [{ id: "ai-on", label: "Turn AI help on", run: () => setOn(true) }];
  return [
    { id: "ai-off", label: "Turn AI help off", run: () => setOn(false) },
    { id: "ai-redo", label: "Redo AI pass", run: redo },
  ];
}
