import { describe, expect, it } from "vitest";
import { isTextField } from "./keys";

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
