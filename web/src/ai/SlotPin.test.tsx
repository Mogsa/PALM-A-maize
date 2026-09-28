import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const toggleSlot = vi.fn();
let ai: unknown = null;
vi.mock("./AiProvider", () => ({ useAi: () => ({ ai, outlined: null, toggleSlot }) }));
import { SlotPin } from "./SlotPin";

const at = { page: 1, rect: [0, 0, 10, 10] };
const withSlots = { schema: 1, extracted_at: "t", defined: {}, reader: { model: "m", made_at: "t", terms: [],
  where_to_look: [{ slot: "Problem", spans: [{ span: "p2-r1", quote: "q", at }] }] } };

describe("SlotPin", () => {
  it("shows 📍 for a slot with spans and toggles its outlines", () => {
    ai = withSlots;
    render(<SlotPin slot="Problem" />);
    fireEvent.click(screen.getByRole("button", { name: /where the paper answers this/i }));
    expect(toggleSlot).toHaveBeenCalledWith(withSlots.reader.where_to_look[0]);
  });
  it("shows nothing for a slot the AI had nothing for, or with AI off", () => {
    ai = withSlots;
    expect(render(<SlotPin slot="Evidence" />).container.textContent).toBe("");
    ai = null;
    expect(render(<SlotPin slot="Problem" />).container.textContent).toBe("");
  });
});
