import { describe, expect, it, vi } from "vitest";
import { aiCommands } from "./commands";

describe("aiCommands", () => {
  it("offers only turning AI help on when it is off", () => {
    const setOn = vi.fn();
    const commands = aiCommands({ on: false, setOn, redo: vi.fn() });
    expect(commands.map((c) => c.label)).toEqual(["Turn AI help on"]);
    commands[0].run();
    expect(setOn).toHaveBeenCalledWith(true);
  });
  it("offers turning it off and a redo when it is on", () => {
    expect(aiCommands({ on: true, setOn: vi.fn(), redo: vi.fn() }).map((c) => c.label))
      .toEqual(["Turn AI help off", "Redo AI pass"]);
  });
});
