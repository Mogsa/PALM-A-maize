import { useRef, type RefObject } from "react";
import { clampSplit, splitAt } from "./model/paperView";
import { DRAGGING_CLASS, REFIT_EVENT } from "./paper/fit";

/** One arrow key moves the divider this share of the width. */
const KEY_STEP = 0.05;

/** The columns of the "both" view for a split: paper, divider, board. */
export const bothColumns = (split: number) => `${split}fr 6px ${1 - split}fr`;

type Props = { views: RefObject<HTMLDivElement | null>; split: number; onCommit: (split: number) => void };

/** The divider between the paper and the board. A drag moves the columns directly, with no render, so neither pane
 *  redraws while it moves; the split is saved, and the paper refits to its pane, once, on release. */
export function SplitDivider({ views, split, onCommit }: Props) {
  const live = useRef(split);
  const move = (event: React.PointerEvent) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !views.current) return;
    live.current = splitAt(event.clientX, views.current.getBoundingClientRect());
    views.current.style.gridTemplateColumns = bothColumns(live.current);
  };
  /** The drag is over: the paper fits itself to its new width now, once. */
  const endDrag = () => { views.current?.classList.remove(DRAGGING_CLASS); window.dispatchEvent(new Event(REFIT_EVENT)); };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.key === "ArrowLeft" ? -KEY_STEP : event.key === "ArrowRight" ? KEY_STEP : 0;
    if (step) { event.preventDefault(); onCommit(clampSplit(split + step)); }
  };
  return (
    <div className="split-divider" role="separator" aria-orientation="vertical" aria-label="Divider between the paper and the board"
         aria-valuenow={Math.round(split * 100)} aria-valuemin={15} aria-valuemax={85} tabIndex={0}
         onPointerDown={(e) => { live.current = split; e.currentTarget.setPointerCapture(e.pointerId); views.current?.classList.add(DRAGGING_CLASS); }}
         onPointerMove={move}
         onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); onCommit(live.current); endDrag(); }}
         onKeyDown={onKeyDown} />
  );
}
