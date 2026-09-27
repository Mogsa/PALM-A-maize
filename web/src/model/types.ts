import type { Node } from "@xyflow/react";

/** Board schema 2 (SPEC-ADDENDUM.md section 4), the server's `board_model.py` field for field. */

export type Rect = [number, number, number, number];
export type PageRect = { page: number; rect: Rect };

export type QuoteSelector = { exact: string; prefix: string; suffix: string };
export type AnchorState = "anchored" | "relocated" | "orphaned";
/** `rects` is one rect per line of the selection, in reading order (addendum 5.1). */
export type HighlightAnchor = { rects: PageRect[]; quote: QuoteSelector; position: number; state: AnchorState };
export type ChunkAnchor = { rects: PageRect[]; start: QuoteSelector; end: QuoteSelector; position: number; state: AnchorState };

// Fields the server's model marks optional are omitted from board JSON when null (the saved file and GET
// both drop them), so they are typed `?:`. Read them with truthiness or `??`, never `=== null`.
export type Highlight = { id: string; tags: string[]; anchor: HighlightAnchor };

/** What a chunk shows, in reading order (addendum 4.0). A clip block is rendered by `GET /render`. */
export type TextBlock = { kind: "text"; page: number; rect: Rect; text: string };
export type ClipBlock = { kind: "clip"; page: number; rect: Rect; label?: string | null };
export type Block = TextBlock | ClipBlock;

export type NoteOrigin = "reader" | "ai";

export type ChunkData = { tags: string[]; collapsed: boolean; region: ChunkAnchor; blocks: Block[]; user_sized: boolean; source_id?: string | null };
export type FigureData = { tags: string[]; collapsed: boolean; region: ChunkAnchor; clip?: string | null; clip_size?: { width: number; height: number } | null; caption: string; user_sized?: boolean; source_id?: string | null };
export type NoteData = { tags: string[]; collapsed: boolean; note: string; origin?: NoteOrigin; user_sized?: boolean };
/** `tray` is true on the tray only; `prompt` makes a group a slot (addendum 4.9). */
export type GroupData = { tags: string[]; name?: string | null; tray?: boolean | null; prompt?: string | null };

export type ChunkNode = Node<ChunkData, "chunk">;
export type FigureNode = Node<FigureData, "figure">;
export type NoteNode = Node<NoteData, "note">;
export type GroupNode = Node<GroupData, "group">;
export type BoardNode = ChunkNode | FigureNode | NoteNode | GroupNode;

/** A connection between the two things themselves, each a node id or a highlight id. React Flow's
 *  source/target and handles are computed at render (model/edges.ts), never stored (addendum 4.0).
 *  `selected` is runtime only, like a node's, and stripped on save. */
export type BoardEdge = { id: string; from: string; to: string; data: { tags: string[] }; selected?: boolean };

export type Viewport = { x: number; y: number; zoom: number };
/** "both" shows the paper and the board side by side. */
export type BoardView = "paper" | "board" | "both";
/** The plan's name for `BoardView`: the view the paper is open in. */
export type View = BoardView;
/** The page at the top of the paper view, and how far down it the view starts, in PDF points. */
export type PaperScroll = { page: number; y: number };

export type Board = {
  schema: 2;
  paper_id: string;
  version: number;
  goal: string;
  nodes: BoardNode[];
  edges: BoardEdge[];
  highlights: Highlight[];
  anchor_basis?: string | null;   // set by the server on load; must round-trip unchanged on save
};

export type Section = { id: string; number: string | null; depth: number; title: string; heading_rect: PageRect; extent: PageRect[]; text: string };
export type Figure = { id: string; kind: "figure" | "table"; label: string | null; caption: string; caption_rect: PageRect | null; rect: PageRect; confidence: string };
export type LayoutRegion = { page: number; rect: Rect; label: string };
export type PageInfo = { index: number; width: number; height: number; rotation: number };
export type Source = { schema: 1; paper_id: string; pages: PageInfo[]; sections: Section[]; figures: Figure[]; regions: LayoutRegion[]; page_text: { page: number; text: string }[] };

export type SelectionMode = "text" | "area";
export type Selection = { text: string; rects: PageRect[]; region_label: string | null; highlight: HighlightAnchor; chunk: ChunkAnchor; blocks: Block[] };
export type PaperSummary = { paper_id: string; title: string; page_count: number };

export type Tag = { id: string; name: string; colour: string };
export type TagFile = { schema: 1; tags: Tag[] };
export type TemplateSlot = { name: string; prompt: string };
export type TemplateFile = { schema: 1; slots: TemplateSlot[] };
/** The plan's name for `TemplateSlot`. */
export type Slot = TemplateSlot;

export type Question = { id: string; kind: "highlight" | BoardNode["type"]; text: string };
export type ExportOrder = "paper" | "template";
/** `POST /export` returns `{path}` (addendum 6); `markdown` is read when the server also sends it. */
export type ExportResult = { path: string; markdown?: string };
/** A piece `POST /split` proposes: no id and no parentId; the client mints the id (addendum 6). */
export type SplitDraft =
  | { type: "chunk"; position: { x: number; y: number }; data: ChunkData }
  | { type: "figure"; position: { x: number; y: number }; data: FigureData };
export type ReextractResult = { changed: string[]; states: Record<string, AnchorState> };
/** Split here or Cut out on a card (addendum 4.10). */
export type RecutMode = "split" | "cut";
/** A chunk the chunk routes propose: no id, position or parentId; the client takes those from the chunk it replaces
 *  (addendum 6). */
export type Piece = { type: "chunk"; data: ChunkData };
/** `POST /chunks/join`: the joined piece, and the indices of the regions sent, in paper order. */
export type JoinResult = { node: Piece; order: number[] };

/** A note's file (addendum 4.4): its text, and whether it has a sketch (D23). */
export type NoteFile = { markdown: string; has_sketch: boolean };
/** A freehand stroke as drawn: points of [x, y, pressure] and the pen's size (D23). */
export type Stroke = { points: [number, number, number][]; size: number };
/** notes/<id>.sketch.json: enough to draw the strokes again. */
export type Sketch = { width: number; height: number; strokes: Stroke[] };
/** A PUT of a sketch: the strokes, and each stroke's outline as SVG path data, which the server checks and draws. */
export type SketchUpload = Sketch & { paths: string[] };

export const emptyBoard = (paper_id: string): Board => ({
  schema: 2, paper_id, version: 0, goal: "", nodes: [], edges: [], highlights: [],
});
