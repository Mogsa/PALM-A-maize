import { afterEach, describe, expect, it } from "vitest";
import { extraCommands, extraSelectionItems, filterCommands, registerCommands, registerSelectionItems, type BoardHandle, type Command } from "./registry";

const board = {} as BoardHandle;
const cmd = (id: string, label: string, keywords?: string): Command => ({ id, label, keywords, run: () => undefined });
const undo: (() => void)[] = [];
afterEach(() => { undo.splice(0).forEach((u) => u()); });

describe("the command registry (Part B's hook)", () => {
  it("lists what a source registers, and forgets it when unregistered", () => {
    undo.push(registerCommands(() => [cmd("ai", "AI help: off")]));
    expect(extraCommands(board).map((c) => c.id)).toEqual(["ai"]);
    undo.pop()!();
    expect(extraCommands(board)).toEqual([]);
  });
  it("gives each selection source the selection it is about", () => {
    undo.push(registerSelectionItems((target) => (target.text ? [{ id: "define", label: `Define ${target.text}`, run: () => undefined }] : [])));
    const at = new DOMRect();
    expect(extraSelectionItems({ on: "paper", text: "ResNet", rects: [], at }, board).map((i) => i.label)).toEqual(["Define ResNet"]);
    expect(extraSelectionItems({ on: "paper", text: "", rects: [], at }, board)).toEqual([]);
  });
});

describe("filterCommands", () => {
  const all = [cmd("export", "Export"), cmd("split", "Add missing sections", "split tray"), cmd("find", "Find in paper", "search")];
  it("keeps every command for an empty query", () => { expect(filterCommands(all, "  ")).toEqual(all); });
  it("matches every word, in the label or the keywords, ignoring case", () => {
    expect(filterCommands(all, "SPLIT").map((c) => c.id)).toEqual(["split"]);
    expect(filterCommands(all, "find pap").map((c) => c.id)).toEqual(["find"]);
    expect(filterCommands(all, "export tray")).toEqual([]);
  });
});
