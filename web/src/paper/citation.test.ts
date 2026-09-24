import { describe, expect, it } from "vitest";
import type { LayoutRegion, PageInfo } from "../model/types";
import { CARD_DEPTH_PT, cardRect, firstEntry, resolveLink } from "./citation";

const ref = { num: 40, gen: 0 };
const page: PageInfo = { index: 8, width: 612, height: 792, rotation: 0 };
const item = (rect: [number, number, number, number]): LayoutRegion => ({ page: 8, rect, label: "list-item" });
// ResNet p9's bibliography, two columns of entries. [9] is indented to x 54.1, past the destination's left of 50.1.
const regions = [
  item([54.097, 251.335, 286.362, 276.832]),
  item([50.112, 557.635, 286.362, 574.272]),
  item([50.112, 577.556, 286.362, 603.666]),
  item([308.862, 76.519, 545.115, 93.164]),
  { page: 7, rect: [0, 0, 612, 792], label: "text" } as LayoutRegion,
];

describe("cardRect (D24): where the words at a link's destination are read", () => {
  it("runs from the destination's top down CARD_DEPTH_PT, across the column it lands in", () => {
    // ResNet cite.LeCun1989: XYZ 50.112, 218.728 in PDF user space, so 573.272 from the top.
    const rect = cardRect([ref, { name: "XYZ" }, 50.112, 218.728, null], page, regions)!;
    expect(rect[0]).toBeCloseTo(50.112, 3);
    expect(rect[1]).toBeCloseTo(573.272, 3);
    expect(rect[2]).toBeCloseTo(286.362, 3);
    expect(rect[3]).toBeCloseTo(573.272 + CARD_DEPTH_PT, 3);
  });
  it("takes the nearest region's column when the destination's left lies just outside it", () => {
    const rect = cardRect([ref, { name: "XYZ" }, 50.112, 792 - 250, null], page, regions)!;
    expect([rect[0], rect[2]]).toEqual([50.112, 286.362]);
  });
  it("reads the right column for a destination there", () => {
    const rect = cardRect([ref, { name: "XYZ" }, 308.862, 792 - 70, null], page, regions)!;
    expect([rect[0], rect[2]]).toEqual([308.862, 545.115]);
  });
  it("falls back to the half of the page the destination is in when no region lies there", () => {
    expect(cardRect([ref, { name: "XYZ" }, 400, 792 - 700, null], page, regions)).toEqual([306, 700, 612, 700 + CARD_DEPTH_PT]);
    expect(cardRect([ref, { name: "XYZ" }, 60, 792 - 700, null], page, regions)).toEqual([0, 700, 306, 700 + CARD_DEPTH_PT]);
    // Only the other column has a region at that height: too far sideways to be this destination's column.
    expect(cardRect([ref, { name: "XYZ" }, 60, 792 - 70, null], page, regions)).toEqual([0, 70, 306, 70 + CARD_DEPTH_PT]);
  });
  it("stops at the page's bottom edge, and reads from the page's top for a whole-page destination", () => {
    expect(cardRect([ref, { name: "XYZ" }, 60, 10, null], page, [])![3]).toBe(792);
    expect(cardRect([ref, { name: "Fit" }], page, [])).toEqual([0, 0, 306, CARD_DEPTH_PT]);
  });
  it("is null for what is not an explicit destination", () => {
    expect(cardRect("cite.LeCun1989", page, regions)).toBeNull();
  });
});

describe("firstEntry (D24): the words at a destination, trimmed to one reference", () => {
  it("stops at the next numbered entry, joining lines and keeping a line-end hyphen", () => {
    const text = "[22] Y. LeCun, B. Boser, J. S. Denker, D. Henderson, R. E. Howard,\nW. Hubbard, and L. D. Jackel. Backpropagation applied to hand-\n"
      + "written zip code recognition. Neural computation, 1989.\n[23] Y. LeCun, L. Bottou, G. B. Orr, and K.-R. M¨uller. Efﬁcient backprop.\n";
    expect(firstEntry(text)).toBe("[22] Y. LeCun, B. Boser, J. S. Denker, D. Henderson, R. E. Howard, W. Hubbard, and L. D. Jackel. "
      + "Backpropagation applied to hand-written zip code recognition. Neural computation, 1989.");
  });
  it("stops at a page number on a line of its own", () => {
    const text = "[24] Minh-Thang Luong, Hieu Pham, and Christopher D Manning. Effective approaches to attention-\n"
      + "based neural machine translation. arXiv preprint arXiv:1508.04025, 2015.\n11\n";
    expect(firstEntry(text)).toBe("[24] Minh-Thang Luong, Hieu Pham, and Christopher D Manning. Effective approaches to attention-based "
      + "neural machine translation. arXiv preprint arXiv:1508.04025, 2015.");
  });
  it("stops at the next author-year entry: a surname and comma after a line ending in a full stop", () => {
    // Adam's bibliography: "He, Xiaodong," continues an author list (the line before ends in a comma), "Duchi, John," starts an entry.
    const text = "Deng, Li, Li, Jinyu, Huang, Jui-Ting, Yao, Kaisheng, Yu, Dong, Seide, Frank, Seltzer, Michael, Zweig, Geoff,\n"
      + "He, Xiaodong, Williams, Jason, et al. Recent advances in deep learning for speech research at microsoft.\nICASSP 2013, 2013.\n"
      + "Duchi, John, Hazan, Elad, and Singer, Yoram. Adaptive subgradient methods for online learning and stochastic\n";
    expect(firstEntry(text)).toBe("Deng, Li, Li, Jinyu, Huang, Jui-Ting, Yao, Kaisheng, Yu, Dong, Seide, Frank, Seltzer, Michael, Zweig, Geoff, "
      + "He, Xiaodong, Williams, Jason, et al. Recent advances in deep learning for speech research at microsoft. ICASSP 2013, 2013.");
    expect(firstEntry("Graves, Alex. Generating sequences. arXiv, 2013.\nGraves, Alex, Mohamed, Abdel-rahman, and Hinton, Geoffrey.\n"))
      .toBe("Graves, Alex. Generating sequences. arXiv, 2013.");
  });
  it("stops at a blank line", () => {
    expect(firstEntry("Kingma, D. Adam. 2015.\n\nSomething else\n")).toBe("Kingma, D. Adam. 2015.");
  });
  it("keeps what is not a reference whole: a caption shows as it is", () => {
    expect(firstEntry("Figure 1. Training error (left) and test error (right)\non CIFAR-10 with 20-layer networks.\n"))
      .toBe("Figure 1. Training error (left) and test error (right) on CIFAR-10 with 20-layer networks.");
  });
  it("is empty for no words", () => {
    expect(firstEntry("")).toBe("");
  });
});

describe("resolveLink (D24): a hovered link to its destination, as pdf.js reads it", () => {
  const lecun = [{ num: 40, gen: 0 }, { name: "XYZ" }, 50.112, 218.728, null];
  const pdf = {
    getPage: async (n: number) => ({
      getAnnotations: async () => n === 1
        ? [{ id: "25R", subtype: "Link", dest: "cite.LeCun1989" }, { id: "26R", subtype: "Link", dest: lecun },
           { id: "27R", subtype: "Link", url: "https://example.org" }, { id: "28R", subtype: "Link", dest: [3, { name: "Fit" }] }]
        : [],
    }),
    getDestination: async (name: string) => (name === "cite.LeCun1989" ? lecun : null),
    getPageIndex: async (ref: unknown) => (ref === lecun[0] ? 8 : -1),
  };
  it("resolves a named destination and its page", async () => {
    expect(await resolveLink(pdf, 1, "25R")).toEqual({ pageIndex: 8, dest: lecun });
  });
  it("takes an explicit destination as it is, and a page given as a number", async () => {
    expect(await resolveLink(pdf, 1, "26R")).toEqual({ pageIndex: 8, dest: lecun });
    expect(await resolveLink(pdf, 1, "28R")).toEqual({ pageIndex: 3, dest: [3, { name: "Fit" }] });
  });
  it("is null for a web link, an unknown annotation or a destination that does not resolve", async () => {
    expect(await resolveLink(pdf, 1, "27R")).toBeNull();
    expect(await resolveLink(pdf, 2, "25R")).toBeNull();
    expect(await resolveLink({ ...pdf, getDestination: async () => null }, 1, "25R")).toBeNull();
  });
});
