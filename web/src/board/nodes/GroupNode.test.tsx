import { cleanup, render } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type GroupNode as GroupNodeType } from "../../model/types";

vi.mock("../../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: emptyBoard("p") }, dispatch: vi.fn() }) }));
vi.mock("../BoardActions", () => ({ useBoardActions: () => ({ setEditing: vi.fn() }) }));
vi.mock("@xyflow/react", () => ({ Handle: () => null, NodeResizer: () => null, Position: { Left: "left", Right: "right" } }));
vi.mock("./NodeTags", () => ({ NodeTags: () => null }));
vi.mock("../CardBar", () => ({ CardBar: () => null }));
vi.mock("./TrayRows", () => ({ TrayRows: () => <div className="ghost-row" /> }));
const flags = vi.hoisted(() => ({ trays: false }));
vi.mock("../../model/tray", async (actual) => ({ ...(await actual<object>()), get TRAYS_ENABLED() { return flags.trays; } }));
import { GroupNode } from "./GroupNode";

afterEach(cleanup);

const slot = { id: "n-slot", data: { tags: [], name: "Problem", prompt: "What problem does it solve?" }, selected: false } as unknown as NodeProps<GroupNodeType>;

describe("GroupNode slot", () => {
  it("shows its question and no 📍 pin: key sentences replaced where-to-look", () => {
    const { container, getAllByRole } = render(<GroupNode {...slot} />);
    expect(getAllByRole("button").map((b) => b.textContent)).toEqual(["What problem does it solve?"]);
    expect(container.textContent).not.toContain("📍");
  });
});

describe("GroupNode marked tray", () => {
  const tray = { id: "n-tray", data: { tags: [], name: "Paper", tray: true }, selected: false } as unknown as NodeProps<GroupNodeType>;
  afterEach(() => { flags.trays = false; });
  it("with trays off is an ordinary group: its name, no tray look, no ghost rows", () => {
    const { container } = render(<GroupNode {...tray} />);
    expect(container.querySelector(".group-name")?.textContent).toBe("Paper");
    expect(container.querySelector(".node.group.tray")).toBeNull();
    expect(container.querySelector(".ghost-row")).toBeNull();
  });
  it("with trays on is the tray, with its ghost rows", () => {
    flags.trays = true;
    const { container } = render(<GroupNode {...tray} />);
    expect(container.querySelector(".node.group.tray")).not.toBeNull();
    expect(container.querySelector(".ghost-row")).not.toBeNull();
  });
});
