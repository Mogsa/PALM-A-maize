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
});
