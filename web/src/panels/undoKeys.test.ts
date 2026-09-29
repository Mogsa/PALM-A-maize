import { describe, expect, it } from "vitest";
import { undoKeyAction, type KeyLike } from "./undoKeys";

const key = (over: Partial<KeyLike> = {}): KeyLike => ({ key: "z", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, target: document.body, ...over });

describe("undo keys (addendum 4.7)", () => {
  it("Cmd-Z undoes and Shift-Cmd-Z redoes, and Ctrl does the same", () => {
    expect(undoKeyAction(key())).toBe("undo");
    expect(undoKeyAction(key({ key: "Z", shiftKey: true }))).toBe("redo");
    expect(undoKeyAction(key({ metaKey: false, ctrlKey: true }))).toBe("undo");
  });
  it("ignores keys typed into a text field", () => {
    expect(undoKeyAction(key({ target: document.createElement("textarea") }))).toBeNull();
    expect(undoKeyAction(key({ target: document.createElement("input") }))).toBeNull();
  });
  it("ignores other keys, a bare Z, and Alt", () => {
    expect(undoKeyAction(key({ key: "y" }))).toBeNull();
    expect(undoKeyAction(key({ metaKey: false }))).toBeNull();
    expect(undoKeyAction(key({ altKey: true }))).toBeNull();
  });
});
