import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client";
import { useBoard, useNote } from "../state/BoardProvider";
import { initialInk, inkReducer, PEN_SIZE, pointFrom, SKETCH_HEIGHT, SKETCH_WIDTH, strokePath, type InkAction } from "./sketch";

export const SKETCH_LOAD_FAILED_MESSAGE = "Could not load this sketch.";
export const SKETCH_SAVE_FAILED_MESSAGE = "Could not save this sketch. Your drawing is kept here; try Done again.";

type Tool = "pen" | "eraser";

/** Stops an event at the editor: it is drawn outside the board and the paper, but React still bubbles its events to
 *  the note that opened it, whose card would be selected or dragged and whose popover would close. */
const stop = (event: React.SyntheticEvent) => event.stopPropagation();

/** Loads the note's saved strokes to draw on. Until they are here the surface is read-only (as a note's text, M3). */
function useSavedStrokes(paperId: string, noteId: string, hasSketch: boolean, dispatch: React.Dispatch<InkAction>) {
  const [state, setState] = useState<"loading" | "ready" | "failed">(hasSketch ? "loading" : "ready");
  // Loaded once, when the editor opens (`hasSketch` as it was then): nothing may reload over the drawing.
  const hadSketch = useRef(hasSketch);
  useEffect(() => {
    if (!hadSketch.current) return;
    let live = true;
    api.getSketch(paperId, noteId).then(
      (sketch) => { if (live) { dispatch({ type: "load", strokes: sketch.strokes }); setState("ready"); } },
      (cause: unknown) => { console.error(SKETCH_LOAD_FAILED_MESSAGE, cause); if (live) setState("failed"); },
    );
    return () => { live = false; };
  }, [paperId, noteId, dispatch]);
  return state;
}

/** Draws a note's sketch (D23): Pen, Eraser (a whole stroke at a touch), Undo, Done. Pointer events serve a
 *  mouse, a finger and a pen, and only a pen's pressure is used. Saving is not a board change, so not an undo step. */
export function SketchEditor({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const { paperId } = useBoard();
  const { hasSketch, sketchSaved } = useNote(noteId);
  const [ink, dispatch] = useReducer(inkReducer, initialInk);
  const [tool, setTool] = useState<Tool>("pen");
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const loaded = useSavedStrokes(paperId, noteId, hasSketch, dispatch);
  const dialog = useRef<HTMLDivElement>(null);
  const surface = useRef<SVGSVGElement>(null);
  const pointer = useRef<number | null>(null);   // the pointer drawing or erasing now
  useEffect(() => { dialog.current?.focus(); }, []);

  const at = (event: React.PointerEvent) => pointFrom(event, surface.current!.getBoundingClientRect(), SKETCH_WIDTH, SKETCH_HEIGHT);
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.stopPropagation();
    if (loaded !== "ready" || pointer.current !== null) return;
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);   // keep the stroke when the pointer leaves the surface
    const point = at(event);
    dispatch(tool === "pen" ? { type: "start", point, size: PEN_SIZE } : { type: "erase", point: [point[0], point[1]] });
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== event.pointerId) return;
    const point = at(event);
    dispatch(tool === "pen" ? { type: "extend", point } : { type: "erase", point: [point[0], point[1]] });
  };
  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    dispatch({ type: "end" });
  };

  const done = async () => {
    if (!ink.past.length) { onClose(); return; }   // nothing changed since it opened
    setSaving(true);
    setSaveFailed(false);
    try {
      if (ink.strokes.length) {
        const paths = ink.strokes.map(strokePath).filter(Boolean);
        await api.putSketch(paperId, noteId, { width: SKETCH_WIDTH, height: SKETCH_HEIGHT, strokes: ink.strokes, paths });
      } else {
        await api.deleteSketch(paperId, noteId);
      }
      sketchSaved(ink.strokes.length > 0);
      onClose();
    } catch (cause) {
      console.error(SKETCH_SAVE_FAILED_MESSAGE, cause);
      setSaveFailed(true);
      setSaving(false);
    }
  };

  const shown = ink.drawing ? [...ink.strokes, ink.drawing] : ink.strokes;
  const blocked = loaded !== "ready" || saving;
  return createPortal(
    <div className="sketch-backdrop nodrag nopan nowheel" onPointerDown={stop} onMouseDown={stop} onMouseUp={stop} onClick={stop}
         onDoubleClick={stop} onKeyDown={stop} onWheel={stop} onContextMenu={stop}>
      <div ref={dialog} className="sketch-editor" role="dialog" aria-label="Sketch" aria-modal="true" tabIndex={-1}>
        <div className="sketch-tools" role="toolbar" aria-label="Sketch tools">
          <button className={tool === "pen" ? "active" : ""} aria-pressed={tool === "pen"} onClick={() => setTool("pen")}>Pen</button>
          <button className={tool === "eraser" ? "active" : ""} aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}>Eraser</button>
          <button onClick={() => dispatch({ type: "undo" })} disabled={blocked || !ink.past.length}>Undo</button>
          <button className="primary" onClick={() => void done()} disabled={blocked}>Done</button>
        </div>
        <svg ref={surface} className={`sketch-surface ${tool}`} aria-label="Drawing surface" role="img"
             viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`} width={SKETCH_WIDTH} height={SKETCH_HEIGHT}
             onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {shown.map((stroke, i) => <path key={i} d={strokePath(stroke)} />)}
        </svg>
        {loaded === "loading" && <p className="sketch-status">Loading…</p>}
        {loaded === "failed" && <p className="note-error" role="alert">{SKETCH_LOAD_FAILED_MESSAGE}</p>}
        {saveFailed && <p className="note-error" role="alert">{SKETCH_SAVE_FAILED_MESSAGE}</p>}
      </div>
    </div>,
    document.body,
  );
}
