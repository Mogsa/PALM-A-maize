import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { api } from "../api/client";
import type { XY } from "../model/reparent";
import type { Board, PageRect, SelectionMode, Source } from "../model/types";
import { headingAt, isClick, markAt, pagePoint, type PaperHit } from "./hit";
import { PageOverlay } from "./PageOverlay";
import { bandBox, useRectangleDrag } from "./rectangleDrag";
import { pageFrames, readSelection } from "./selection";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

export const PAGE_WIDTH_PX = 760;
/** Clicks on these are theirs, not a click on the paper. */
export const OWN_CLICK_TARGETS = "a, button, input, textarea, select, .margin, .annotationLayer, .popover";

type Props = {
  paperId: string;
  source: Source;
  board: Board;
  focus: PageRect | null;                       // scroll here once, then onFocusHandled
  onFocusHandled: () => void;
  onSelect: (rects: PageRect[], anchorEl: DOMRect, exact: boolean, mode: SelectionMode) => void;
  onClickPaper: (hit: PaperHit) => void;
  onOutlineClick: (nodeId: string) => void;
};

/** The selection's anchor: its last rect with real extent. The spike measured zero-width `<br>` rects at the end
 *  of the range with unrelated y values, so the last rect alone is unusable. */
function selectionAnchor(): DOMRect | undefined {
  const lines = Array.from(window.getSelection()!.getRangeAt(0).getClientRects());
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].width >= 1 && lines[i].height >= 1) return lines[i];
  }
  return undefined;
}

const bandStyle = (a: XY, b: XY) => { const r = bandBox(a, b); return { left: r.left, top: r.top, width: r.width, height: r.height }; };

export function PaperView({ paperId, source, board, focus, onFocusHandled, onSelect, onClickPaper, onOutlineClick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const down = useRef<XY | null>(null);
  const onRect = useCallback((rect: PageRect, at: DOMRect, exact: boolean) => onSelect([rect], at, exact, "area"), [onSelect]);
  const rectangle = useRectangleDrag(container, source, onRect);

  useEffect(() => {
    if (!focus || !container.current || !ready) return;
    const el = container.current.querySelector<HTMLElement>(`.react-pdf__Page[data-page-number="${focus.page + 1}"]`);
    if (!el) return;
    const canvas = el.querySelector<HTMLElement>(".react-pdf__Page__canvas") ?? el;
    const scale = canvas.clientWidth / source.pages[focus.page].width;
    el.scrollIntoView({ block: "start" });
    container.current.scrollBy({ top: focus.rect[1] * scale - 80 });
    onFocusHandled();   // a jump is an event: consumed, so it never re-applies
  }, [focus, ready, source, onFocusHandled]);

  const selectText = (rects: PageRect[], exact: boolean) => {
    const anchor = selectionAnchor();
    if (anchor) onSelect(rects, anchor, exact, "text");
  };
  const clickAt = (event: React.MouseEvent) => {
    if (!container.current || !isClick(down.current, { x: event.clientX, y: event.clientY })) return;
    if ((event.target as HTMLElement).closest(OWN_CLICK_TARGETS)) return;
    const point = pagePoint(event.clientX, event.clientY, pageFrames(container.current, source));
    if (!point) return;
    const mark = markAt(point, board.highlights);
    const heading = mark ? null : headingAt(point, source.sections);
    if (mark || heading) onClickPaper({ mark, heading, at: new DOMRect(event.clientX, event.clientY, 0, 0) });
  };
  const onMouseDown = (event: React.MouseEvent) => {
    down.current = null;
    if (rectangle.begin(event)) return;
    down.current = { x: event.clientX, y: event.clientY };
  };
  const onMouseUp = (event: React.MouseEvent) => {
    if (!container.current || rectangle.band) return;   // the rectangle's own mouse-up handles it
    const rects = readSelection(container.current, source);
    if (rects) selectText(rects, event.altKey);
    else clickAt(event);
  };

  return (
    <div ref={container} className="paper" onMouseDown={onMouseDown} onMouseUp={onMouseUp}>
      <Document file={api.pdfUrl(paperId)} onLoadSuccess={() => setReady(true)} loading={<div className="loading">Loading the paper</div>}>
        {source.pages.map((p) => (
          <div key={p.index} className="page-wrap">
            <Page pageIndex={p.index} width={PAGE_WIDTH_PX} renderAnnotationLayer={false} renderTextLayer />
            <PageOverlay page={p.index} scale={PAGE_WIDTH_PX / p.width} board={board} onOutlineClick={onOutlineClick} />
          </div>
        ))}
      </Document>
      {rectangle.band && <div className="rubber-band" style={bandStyle(rectangle.band.start, rectangle.band.end)} />}
    </div>
  );
}
