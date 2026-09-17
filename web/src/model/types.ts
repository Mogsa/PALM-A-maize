import type { Edge, Node } from "@xyflow/react";

export type Rect = [number, number, number, number];
export type PageRect = { page: number; rect: Rect };

export type QuoteSelector = { exact: string; prefix: string; suffix: string };
export type AnchorState = "anchored" | "relocated" | "orphaned";
export type HighlightAnchor = { page: number; rect: Rect; quote: QuoteSelector; position: number; state: AnchorState };
export type ChunkAnchor = { rects: PageRect[]; start: QuoteSelector; end: QuoteSelector; position: number; state: AnchorState };

// Fields the server's model marks optional are omitted from board JSON when null (the saved file and GET
// both drop them), so they are typed `?:`. Read them with truthiness or `??`, never `=== null`.
export type Highlight = { id: string; tags: string[]; note?: string | null; anchor: HighlightAnchor };

export type ChunkData = { tags: string[]; collapsed: boolean; region: ChunkAnchor; text: string; user_sized: boolean; source_id?: string | null };
export type FigureData = { tags: string[]; collapsed: boolean; region: ChunkAnchor; clip?: string | null; clip_size?: { width: number; height: number } | null; caption: string; source_id?: string | null };
export type NoteData = { tags: string[]; collapsed: boolean; note: string };
export type GroupData = { tags: string[]; name?: string | null };

export type ChunkNode = Node<ChunkData, "chunk">;
export type FigureNode = Node<FigureData, "figure">;
export type NoteNode = Node<NoteData, "note">;
export type GroupNode = Node<GroupData, "group">;
export type BoardNode = ChunkNode | FigureNode | NoteNode | GroupNode;
export type BoardEdge = Edge<{ tags: string[] }>;

export type Viewport = { x: number; y: number; zoom: number };

export type Board = {
  schema: 1;
  paper_id: string;
  version: number;
  goal: string;
  active_tags: string[];
  viewport: Viewport;
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

export type Selection = { text: string; rects: PageRect[]; region_label: string | null; highlight: HighlightAnchor | null; chunk: ChunkAnchor };
export type PaperSummary = { paper_id: string; title: string; page_count: number };

export const emptyBoard = (paper_id: string): Board => ({
  schema: 1, paper_id, version: 0, goal: "", active_tags: [], viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], highlights: [],
});
