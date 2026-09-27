import { describe, expect, it } from "vitest";
import { isTextField, paperHoldsDelete } from "./keys";

describe("isTextField", () => {
  it("is true where typing happens, false elsewhere", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    for (const tag of ["input", "textarea", "select"]) expect(isTextField(document.createElement(tag))).toBe(true);
    expect(isTextField(editable)).toBe(true);
    expect(isTextField(document.createElement("button"))).toBe(false);
    expect(isTextField(document.body)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
  it("an input counts only when it takes text: a checkbox keeps the board's undo", () => {
    const input = (type: string) => Object.assign(document.createElement("input"), { type });
    for (const type of ["text", "search", "number", "email", "url", "password", "tel"]) expect(isTextField(input(type))).toBe(true);
    for (const type of ["checkbox", "radio", "button", "range", "color", "submit"]) expect(isTextField(input(type))).toBe(false);
  });
});

describe("paperHoldsDelete", () => {
  const pane = () => {
    document.body.innerHTML = '<div class="paper-pane"><p id="text">Deep residual learning</p></div><div class="board-pane"><p id="card">A card</p></div>';
    return document.querySelector(".paper-pane")!;
  };
  it("is false with nothing of the paper's open", () => {
    pane();
    window.getSelection()!.removeAllRanges();
    expect(paperHoldsDelete(document)).toBe(false);
  });
  it("is true while a paper popover is open (a mark's, or a selection's choice)", () => {
    pane().insertAdjacentHTML("beforeend", '<div class="popover" role="dialog"></div>');
    expect(paperHoldsDelete(document)).toBe(true);
  });
  it("is true while text on the paper is selected, but not text on the board", () => {
    pane();
    const select = (id: string) => { const range = document.createRange(); range.selectNodeContents(document.getElementById(id)!); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); };
    select("text");
    expect(paperHoldsDelete(document)).toBe(true);
    select("card");
    expect(paperHoldsDelete(document)).toBe(false);
    window.getSelection()!.removeAllRanges();
  });
});
