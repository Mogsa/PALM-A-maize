import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { api } from "../api/client";
import type { Board, PageRect, Source } from "../model/types";
import { PageOverlay } from "./PageOverlay";
import { readSelection } from "./selection";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

export const PAGE_WIDTH_PX = 760;

type Props = {
  paperId: string;
  source: Source;
  board: Board;
  focus: PageRect | null;                       // scroll here when it changes
  onSelect: (rects: PageRect[], anchorEl: DOMRect, exact: boolean) => void;
  onOutlineClick: (nodeId: string) => void;
};

export function PaperView({ paperId, source, board, focus, onSelect, onOutlineClick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!focus || !container.current || !ready) return;
    const el = container.current.querySelector<HTMLElement>(`.react-pdf__Page[data-page-number="${focus.page + 1}"]`);
    if (!el) return;
    const canvas = el.querySelector<HTMLElement>(".react-pdf__Page__canvas") ?? el;
    const scale = canvas.clientWidth / source.pages[focus.page].width;
    el.scrollIntoView({ block: "start" });
    container.current.scrollBy({ top: focus.rect[1] * scale - 80 });
  }, [focus, ready, source]);

  const onMouseUp = (event: React.MouseEvent) => {
    if (!container.current) return;
    const rects = readSelection(container.current, source);
    if (!rects) return;
    const range = window.getSelection()!.getRangeAt(0);
    const lines = Array.from(range.getClientRects());
    // Anchor at the last rect with real extent: the spike measured zero-width `<br>` rects
    // at the end of the range with unrelated y values, so `lines[lines.length - 1]` is unusable.
    let anchor: DOMRect | undefined;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].width >= 1 && lines[i].height >= 1) { anchor = lines[i]; break; }
    }
    if (!anchor) return;
    onSelect(rects, anchor, event.altKey);
  };

  return (
    <div ref={container} className="paper" onMouseUp={onMouseUp}>
      <Document file={api.pdfUrl(paperId)} onLoadSuccess={() => setReady(true)} loading={<p>Loading paper</p>}>
        {source.pages.map((p) => (
          <div key={p.index} className="page-wrap">
            <Page pageIndex={p.index} width={PAGE_WIDTH_PX} renderAnnotationLayer={false} renderTextLayer />
            <PageOverlay page={p.index} scale={PAGE_WIDTH_PX / p.width} board={board} onOutlineClick={onOutlineClick} />
          </div>
        ))}
      </Document>
    </div>
  );
}
