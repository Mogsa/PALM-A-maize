import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const note = { hasSketch: false, sketchVersion: 0, sketchSaved: vi.fn() };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p" }), useNote: () => note }));
vi.mock("../api/client", () => ({
  api: { putSketch: vi.fn(async () => undefined), deleteSketch: vi.fn(async () => undefined), getSketch: vi.fn() },
}));
import { api } from "../api/client";
import { SketchEditor } from "./SketchEditor";

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\- ]*$/;

function draw(surface: Element, from: [number, number], to: [number, number], pointerType = "mouse") {
  const at = ([clientX, clientY]: [number, number]) => ({ clientX, clientY, pointerId: 1, pointerType, pressure: 0.7, isPrimary: true, buttons: 1 });
  fireEvent.pointerDown(surface, at(from));
  fireEvent.pointerMove(surface, at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]));
  fireEvent.pointerMove(surface, at(to));
  fireEvent.pointerUp(surface, at(to));
}
const strokesOn = (surface: Element) => surface.querySelectorAll("path");

beforeEach(() => { Object.assign(note, { hasSketch: false, sketchVersion: 0 }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SketchEditor (D23)", () => {
  it("turns pointer strokes into paths, and Undo removes the last one", async () => {
    const onClose = vi.fn();
    const { getByRole, getByLabelText } = render(<SketchEditor noteId="n-1" onClose={onClose} />);
    const surface = getByLabelText("Drawing surface");
    draw(surface, [10, 10], [100, 80]);
    draw(surface, [200, 200], [300, 250]);
    expect(strokesOn(surface)).toHaveLength(2);
    fireEvent.click(getByRole("button", { name: "Undo" }));
    expect(strokesOn(surface)).toHaveLength(1);

    await act(async () => { fireEvent.click(getByRole("button", { name: "Done" })); });
    expect(api.putSketch).toHaveBeenCalledTimes(1);
    const [paperId, noteId, sketch] = vi.mocked(api.putSketch).mock.calls[0];
    expect([paperId, noteId]).toEqual(["p", "n-1"]);
    expect(sketch.strokes).toHaveLength(1);
    expect(sketch.strokes[0].points[0]).toEqual([10, 10, 0.5]);   // a mouse has no pressure of its own
    expect(sketch.paths).toHaveLength(1);
    expect(sketch.paths[0]).toMatch(PATH_DATA);
    expect(note.sketchSaved).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("the eraser removes a whole stroke it touches", () => {
    const { getByRole, getByLabelText } = render(<SketchEditor noteId="n-1" onClose={vi.fn()} />);
    const surface = getByLabelText("Drawing surface");
    draw(surface, [10, 10], [100, 80]);
    draw(surface, [400, 300], [500, 350]);
    fireEvent.click(getByRole("button", { name: "Eraser" }));
    fireEvent.pointerDown(surface, { clientX: 55, clientY: 45, pointerId: 1, pointerType: "mouse", buttons: 1 });
    fireEvent.pointerUp(surface, { clientX: 55, clientY: 45, pointerId: 1, pointerType: "mouse" });
    expect(strokesOn(surface)).toHaveLength(1);
  });

  it("a pen's pressure is kept", async () => {
    const { getByRole, getByLabelText } = render(<SketchEditor noteId="n-1" onClose={vi.fn()} />);
    draw(getByLabelText("Drawing surface"), [10, 10], [100, 80], "pen");
    await act(async () => { fireEvent.click(getByRole("button", { name: "Done" })); });
    expect(vi.mocked(api.putSketch).mock.calls[0][2].strokes[0].points[0]).toEqual([10, 10, 0.7]);
  });

  it("opens a saved sketch to draw on, and Clear then Done removes it", async () => {
    Object.assign(note, { hasSketch: true, sketchVersion: 1 });
    vi.mocked(api.getSketch).mockResolvedValueOnce({ width: 600, height: 400, strokes: [{ points: [[5, 5, 0.5], [50, 50, 0.5]], size: 4 }] });
    const onClose = vi.fn();
    const { getByRole, getByLabelText } = render(<SketchEditor noteId="n-1" onClose={onClose} />);
    await waitFor(() => expect(strokesOn(getByLabelText("Drawing surface"))).toHaveLength(1));
    fireEvent.click(getByRole("button", { name: "Clear" }));
    await act(async () => { fireEvent.click(getByRole("button", { name: "Done" })); });
    expect(api.deleteSketch).toHaveBeenCalledWith("p", "n-1");
    expect(api.putSketch).not.toHaveBeenCalled();
    expect(note.sketchSaved).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("Done with nothing changed writes nothing", async () => {
    const onClose = vi.fn();
    const { getByRole } = render(<SketchEditor noteId="n-1" onClose={onClose} />);
    await act(async () => { fireEvent.click(getByRole("button", { name: "Done" })); });
    expect(api.putSketch).not.toHaveBeenCalled();
    expect(api.deleteSketch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("a failed save stays open with the drawing and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.putSketch).mockRejectedValueOnce(new Error("down"));
    const onClose = vi.fn();
    const { getByRole, getByLabelText } = render(<SketchEditor noteId="n-1" onClose={onClose} />);
    draw(getByLabelText("Drawing surface"), [10, 10], [100, 80]);
    await act(async () => { fireEvent.click(getByRole("button", { name: "Done" })); });
    expect(onClose).not.toHaveBeenCalled();
    expect(getByRole("alert").textContent).toMatch(/could not save/i);
    expect(strokesOn(getByLabelText("Drawing surface"))).toHaveLength(1);
  });

  it("keys pressed in it stay in it: the board's Delete and undo never see them", () => {
    const onKey = vi.fn();
    window.addEventListener("keydown", onKey);
    const { getByRole } = render(<SketchEditor noteId="n-1" onClose={vi.fn()} />);
    fireEvent.keyDown(getByRole("dialog", { name: "Sketch" }), { key: "Delete" });
    window.removeEventListener("keydown", onKey);
    expect(onKey).not.toHaveBeenCalled();
  });
});
