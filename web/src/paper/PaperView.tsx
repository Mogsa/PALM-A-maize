import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { api } from "../api/client";
import type { XY } from "../model/reparent";
import type { Board, PageRect, PaperScroll, SelectionMode, Source } from "../model/types";
import { ContextCard } from "./ContextCard";
import type { LinkDocument } from "./citation";
import type { PaperHit } from "./hit";
import { destinationTop } from "./links";
import type { JumpTarget } from "./margin";
import { PageOverlay } from "./PageOverlay";
import { bandBox } from "./rectangleDrag";
import { usePaperScroll } from "./scroll";
import { useCitationCard } from "./useCitationCard";
import { useHoverCard } from "./useHoverCard";
import { useFindMark, type FindMark } from "./useFindMark";
import { usePaperMouse } from "./usePaperMouse";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

export const PAGE_WIDTH_PX = 760;
/** A jump lands this far below the top of the view, so the line above it is still in sight. */
export const FOCUS_OFFSET_PX = 80;

type Props = {
  paperId: string;
  source: Source;
  board: Board;
  focus: PageRect | null;                       // scroll here once, then onFocusHandled
  onFocusHandled: () => void;
  /** `lines` (a text selection only) is the selection one rect per printed line (contract 1). */
  onSelect: (rects: PageRect[], anchorEl: DOMRect, exact: boolean, mode: SelectionMode, lines?: PageRect[]) => void;
  onClickPaper: (hit: PaperHit) => void;
  onOutlineClick: (nodeId: string) => void;
  connecting: boolean;                          // choosing the other end of a connection
  onJump: (target: JumpTarget) => void;
  onOpenNote: (noteId: string) => void;
  findMark: FindMark | null;                    // a find hit to mark in its page's text layer
  paperScroll: PaperScroll | null | undefined;  // where the paper was left: restored once on load (D5)
  onScrollSettled: (scroll: PaperScroll | null) => void;
};

const bandStyle = (a: XY, b: XY) => { const r = bandBox(a, b); return { left: r.left, top: r.top, width: r.width, height: r.height }; };

export function PaperView(props: Props) {
  const { paperId, source, board, focus, onFocusHandled, onOutlineClick, connecting, onJump, onOpenNote, findMark, paperScroll, onScrollSettled } = props;
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const pdf = useRef<LinkDocument | null>(null);
  const hover = useHoverCard();
  const citation = useCitationCard(pdf, source, paperId, hover);
  const mouse = usePaperMouse(container, source, board, props);
  const findProps = useFindMark(container, findMark);
  const onScrollSave = usePaperScroll(container, { ready, source, pageWidthPx: PAGE_WIDTH_PX, paperScroll, onScrollSettled });

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
    onFocusHandled();   // a jump is an event: consumed, so it never re-applies
  }, [focus, ready, scrollToPoint, onFocusHandled]);

  /** The paper's own internal links (D10): to the destination's page and height. Stable, so pages do not redraw. */
  const followLink = useCallback(({ dest, pageIndex }: { dest?: unknown; pageIndex: number }) =>
    scrollToPoint(pageIndex, destinationTop(dest, source.pages[pageIndex].height) ?? 0), [scrollToPoint, source]);
  const onScroll = () => { onScrollSave(); hover.hide(); };

  return (
    <>
      <div ref={container} className={connecting ? "paper connecting" : "paper"} onMouseDown={mouse.onMouseDown} onMouseUp={mouse.onMouseUp}
           onScroll={onScroll} {...citation}>
        <Document file={api.pdfUrl(paperId)} onLoadSuccess={(doc) => { pdf.current = doc; setReady(true); }}
                  loading={<div className="loading">Loading the paper</div>}
                  onItemClick={followLink} externalLinkTarget="_blank" externalLinkRel="noopener noreferrer">
          {source.pages.map((p) => (
            <div key={p.index} className="page-wrap" style={{ height: p.height * (PAGE_WIDTH_PX / p.width) }}>
              <Page pageIndex={p.index} width={PAGE_WIDTH_PX} renderAnnotationLayer renderTextLayer {...findProps(p.index)} />
              <PageOverlay page={p.index} scale={PAGE_WIDTH_PX / p.width} board={board} source={source}
                           onOutlineClick={onOutlineClick} onJump={onJump} onOpenNote={onOpenNote} />
            </div>
          ))}
        </Document>
        {mouse.band && <div className="rubber-band" style={bandStyle(mouse.band.start, mouse.band.end)} />}
      </div>
      {hover.card && <ContextCard card={hover.card} hover={hover} onGo={(at) => scrollToPoint(at.page, at.rect[1])} />}
    </>
  );
}
