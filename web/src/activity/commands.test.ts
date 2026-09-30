import { describe, expect, it, vi } from "vitest";
import { activityCommands } from "./commands";

describe("activity commands in ⌘K", () => {
  it("opens the panel and offers turning the log off while it is on", () => {
    const open = vi.fn();
    const setOn = vi.fn();
    const commands = activityCommands({ on: true, setOn, open });
    expect(commands.map((c) => c.label)).toEqual(["Activity", "Turn activity log off"]);
    commands[0].run();
    expect(open).toHaveBeenCalled();
    commands[1].run();
    expect(setOn).toHaveBeenCalledWith(false);
  });

  it("offers turning it on while it is off", () => {
    const setOn = vi.fn();
    const [, turnOn] = activityCommands({ on: false, setOn, open: vi.fn() });
    expect(turnOn.label).toBe("Turn activity log on");
    turnOn.run();
    expect(setOn).toHaveBeenCalledWith(true);
  });
});
