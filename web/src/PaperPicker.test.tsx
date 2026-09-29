import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return { ...actual, api: { addPaper: vi.fn() } };
});
import { api, ApiError } from "./api/client";
import { ADD_PAPER, PaperPicker } from "./PaperPicker";

const papers = [{ paper_id: "p-1", title: "One", page_count: 3 }];
const pdf = new File(["%PDF-"], "new.pdf", { type: "application/pdf" });

function pick(onAdded = vi.fn()) {
  const { container } = render(<PaperPicker papers={papers} value="p-1" onChange={vi.fn()} onAdded={onAdded} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Paper" }), { target: { value: ADD_PAPER } });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [pdf] } });
  return onAdded;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("adding a paper from the picker", () => {
  it("offers Add paper as the picker's last entry, taking only PDFs", () => {
    const { container } = render(<PaperPicker papers={papers} value="p-1" onChange={vi.fn()} onAdded={vi.fn()} />);
    const options = screen.getAllByRole("option");
    expect(options.at(-1)!.textContent).toBe("Add paper…");
    expect(container.querySelector('input[type="file"]')!.getAttribute("accept")).toBe(".pdf,application/pdf");
  });

  it("uploads, shows it is working, and selects a new paper (201)", async () => {
    let finish: (v: { paper_id: string }) => void = () => undefined;
    vi.mocked(api.addPaper).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const onAdded = pick();
    expect(api.addPaper).toHaveBeenCalledWith(pdf, "new.pdf");
    expect(screen.getByRole("status").textContent).toMatch(/Adding new\.pdf/);
    finish({ paper_id: "p-2" });
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("p-2"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("selects a re-uploaded paper and summarises what moved (200)", async () => {
    vi.mocked(api.addPaper).mockResolvedValueOnce({ paper_id: "p-1", changed: ["h-1", "n-2"], states: { "h-1": "relocated", "n-2": "orphaned", "h-3": "anchored" } });
    const onAdded = pick();
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("p-1"));
    expect(screen.getByRole("status").textContent).toBe("Updated this paper: 2 changed, 1 could not be placed.");
  });

  it.each([
    [415, "not_pdf", "That file is not a PDF."],
    [413, "too_large", "That PDF is too large."],
    [500, "extraction_failed", "Could not read that PDF."],
  ])("shows a %i as one plain line", async (status, code, message) => {
    vi.mocked(api.addPaper).mockRejectedValueOnce(new ApiError(status, code, ""));
    const onAdded = pick();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", message);
    expect(onAdded).not.toHaveBeenCalled();
  });
});
