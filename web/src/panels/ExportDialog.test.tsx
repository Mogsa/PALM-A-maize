import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const flush = vi.fn(async () => { calls.push("flush"); });
vi.mock("../state/BoardProvider", () => ({
  FLUSH_FAILED_MESSAGE: "Some changes could not be saved yet.",
  useBoard: () => ({ paperId: "p", flush, view: { active_tags: ["t-pass1"] } }),
}));
vi.mock("../api/client", () => ({ api: { postExport: vi.fn(async () => { calls.push("export"); return { path: "/data/papers/p/export.md", markdown: "# Title" }; }) } }));
import { api } from "../api/client";
import { FLUSH_FAILED_MESSAGE } from "../state/BoardProvider";
import { ExportDialog } from "./ExportDialog";

afterEach(() => { cleanup(); vi.clearAllMocks(); calls.length = 0; });

describe("export", () => {
  it("saves what is pending first, then writes in the chosen order with the active filter", async () => {
    render(<ExportDialog />);
    fireEvent.change(screen.getByLabelText("Order"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Write export" }));
    expect(await screen.findByText("/data/papers/p/export.md")).toBeTruthy();
    expect(calls).toEqual(["flush", "export"]);
    expect(api.postExport).toHaveBeenCalledWith("p", ["t-pass1"], "template");
    expect(screen.getByText("# Title")).toBeTruthy();
  });
  it("does not export when pending changes could not be saved, and says why", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    flush.mockRejectedValueOnce(new Error(FLUSH_FAILED_MESSAGE));
    render(<ExportDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Write export" }));
    expect(await screen.findByText(FLUSH_FAILED_MESSAGE)).toBeTruthy();
    expect(api.postExport).not.toHaveBeenCalled();
  });
});
