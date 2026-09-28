import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { api } from "../api/client";
import type { XY } from "../model/reparent";
import type { Board, Highlight, PageRect, PaperScroll, SelectionMode, Source } from "../model/types";
import { ContextCard } from "./ContextCard";
import type { LinkDocument } from "./citation";
import type { PaperHit } from "./hit";
import { usePageWidth } from "./fit";
import { destinationTop } from "./links";
import type { JumpTarget } from "./margin";
import { PageOverlay } from "./PageOverlay";
import { bandBox } from "./rectangleDrag";
import { usePaperScroll } from "./scroll";
import { useCitationCard } from "./useCitationCard";
import { useHoverCard } from "./useHoverCard";
import { useTermHover } from "./useTermHover";
import { useFindMark, type FindMark } from "./useFindMark";
import { usePaperMouse } from "./usePaperMouse";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

/** A jump lands this far below the top of the view, so the line above it is still in sight. */
export const FOCUS_OFFSET_PX = 80;
/** How long a place gone to from the board stays flashed. */
export const FLASH_MS = 1200;

/** The place last gone to, flashed briefly so the eye finds it; a page-only jump (no area) is not flashed. */
function useFlash() {
  const [flash, setFlash] = useState<PageRect | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);
  const show = useCallback((at: PageRect) => { if (at.rect[2] > at.rect[0] && at.rect[3] > at.rect[1]) setFlash({ ...at }); }, []);
  return { flash, show };
}

type Props = {
  paperId: string;
  source: Source;
  board: Board;
  focus: PageRect | null;                       // scroll here once, then onFocusHandled
  onFocusHandled: () => void;
  /** `lines` (a text selection only) is the selection one rect per printed line (contract 1). */
  onSelect: (rects: PageRect[], anchorEl: DOMRect, exact: boolean, mode: SelectionMode, lines?: PageRect[]) => void;
  onClickPaper: (hit: PaperHit) => void;
  onMarkMenu: (mark: Highlight, at: DOMRect) => void;   // a right-click on a mark
  onDragSelection?: (event: React.DragEvent, rects: PageRect[], lines?: PageRect[]) => void;
  onOutlineClick: (nodeId: string) => void;
  connecting: boolean;                          // choosing the other end of a connection
  onJump: (target: JumpTarget) => void;
  onOpenNote: (noteId: string) => void;
  findMark: FindMark | null;                    // a find hit to mark in its page's text layer
  paperScroll: PaperScroll | null | undefined;  // where the paper was left: restored once on load (D5)
  onScrollSettled: (scroll: PaperScroll | null) => void;
  /** Fit the page to the pane's width (the both view) rather than show it at full width. */
  fit: boolean;
};

const flashStyle = ({ rect }: PageRect, scale: number) =>
  ({ left: rect[0] * scale, top: rect[1] * scale, width: (rect[2] - rect[0]) * scale, height: (rect[3] - rect[1]) * scale });
const bandStyle = (a: XY, b: XY) => { const r = bandBox(a, b); return { left: r.left, top: r.top, width: r.width, height: r.height }; };

export function PaperView(props: Props) {
  const { paperId, source, board, focus, onFocusHandled, onOutlineClick, connecting, onJump, onOpenNote, findMark, paperScroll, onScrollSettled, fit } = props;
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const pageWidth = usePageWidth(container, fit);
  const pdf = useRef<LinkDocument | null>(null);
  const hover = useHoverCard();
  const citation = useCitationCard(pdf, source, paperId, hover);
  const termHover = useTermHover(container, source, board, hover);
  const mouse = usePaperMouse(container, source, board, props);
  const findProps = useFindMark(container, findMark);
  const { flash, show: showFlash } = useFlash();
  const onScrollSave = usePaperScroll(container, { ready, source, pageWidthPx: pageWidth, paperScroll, onScrollSettled });

  const scrollToPoint = useCallback((page: number, y: number) => {
    const el = container.current?.querySelector<HTMLElement>(`.react-pdf__Page[data-page-number="${page + 1}"]`);
    if (!el || !container.current) return;
    const canvas = el.querySelector<HTMLElement>(".react-pdf__Page__canvas") ?? el;
    el.scrollIntoView({ block: "start" });
    container.current.scrollBy({ top: y * (canvas.clientWidth / source.pages[page].width) - FOCUS_OFFSET_PX });
  }, [source]);

  useEffect(() => {
    if (!focus || !ready) return;
    scrollToPoint(focus.page, focus.rect[1]);
    showFlash(focus);
    onFocusHandled();   // a jump is an event: consumed, so it never re-applies
  }, [focus, ready, scrollToPoint, onFocusHandled, showFlash]);

  /** The paper's own internal links (D10): to the destination's page and height. Stable, so pages do not redraw. */
  const followLink = useCallback(({ dest, pageIndex }: { dest?: unknown; pageIndex: number }) =>
    scrollToPoint(pageIndex, destinationTop(dest, source.pages[pageIndex].height) ?? 0), [scrollToPoint, source]);
  const onScroll = () => { onScrollSave(); hover.hide(); };

  return (
    <>
      <div ref={container} className={connecting ? "paper connecting" : "paper"} style={{ "--page-width": `${pageWidth}px` } as React.CSSProperties} onMouseUp={mouse.onMouseUp} onContextMenu={mouse.onContextMenu}
           onMouseDown={(e) => { hover.close(); mouse.onMouseDown(e); }} onDragStart={mouse.onDragStart} onScroll={onScroll} {...citation} {...termHover}>
        <Document file={api.pdfUrl(paperId)} onLoadSuccess={(doc) => { pdf.current = doc; setReady(true); }}
                  loading={<div className="loading">Loading the paper</div>}
                  onItemClick={followLink} externalLinkTarget="_blank" externalLinkRel="noopener noreferrer">
          {source.pages.map((p) => (
            <div key={p.index} className="page-wrap" style={{ height: p.height * (pageWidth / p.width) }}>
              <Page pageIndex={p.index} width={pageWidth} renderAnnotationLayer renderTextLayer {...findProps(p.index)} />
              <PageOverlay page={p.index} scale={pageWidth / p.width} board={board} source={source}
                           onOutlineClick={onOutlineClick} onJump={onJump} onOpenNote={onOpenNote} />
              {flash?.page === p.index && <div className="focus-flash" style={flashStyle(flash, pageWidth / p.width)} />}
            </div>
          ))}
        </Document>
        {mouse.band && <div className="rubber-band" style={bandStyle(mouse.band.start, mouse.band.end)} />}
      </div>
      {hover.card && <ContextCard card={hover.card} hover={hover} onGo={(at) => scrollToPoint(at.page, at.rect[1])} onOpenNote={onOpenNote} />}
    </>
  );
}
