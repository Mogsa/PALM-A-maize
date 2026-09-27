import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

afterEach(cleanup);

describe("dismissing a popover or menu (no × button)", () => {
  it("Escape closes it", () => {
    const onClose = vi.fn();
    render(<ContextMenu at={new DOMRect(10, 10, 0, 0)} label="Menu" onClose={onClose}><button>One</button></ContextMenu>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("a press outside closes it, a press inside does not", () => {
    const onClose = vi.fn();
    const { getByRole } = render(<ContextMenu at={new DOMRect(10, 10, 0, 0)} label="Menu" onClose={onClose}><button>One</button></ContextMenu>);
    fireEvent.pointerDown(getByRole("button", { name: "One" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
