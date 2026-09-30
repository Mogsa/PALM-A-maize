import type { Command } from "../commands/registry";

/** The activity log's entries in ⌘K (activity log spec): its panel, and the switch for this paper. */
export function activityCommands({ on, setOn, open }: { on: boolean; setOn: (on: boolean) => void; open: () => void }): Command[] {
  return [
    { id: "activity", label: "Activity", keywords: "log history record", run: open },
    on
      ? { id: "activity-off", label: "Turn activity log off", keywords: "record", run: () => setOn(false) }
      : { id: "activity-on", label: "Turn activity log on", keywords: "record", run: () => setOn(true) },
  ];
}
