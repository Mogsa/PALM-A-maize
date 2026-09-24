import "katex/dist/katex.min.css";
import Markdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

// Parsed once, not per render. Raw HTML in a note stays text: react-markdown drops it unless rehype-raw is added, and
// it is not (D22). A formula that does not parse is shown as its source, in place, and never throws.
const REMARK = [remarkMath];
const REHYPE = [[rehypeKatex, { throwOnError: false }] as [typeof rehypeKatex, { throwOnError: boolean }]];
const COMPONENTS: Components = {
  // A link leaves the app in a tab of its own, which gets no handle on this one.
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

/** A note's text as Markdown with maths: `$…$` inline and `$$…$$` on its own lines (D22). Editing stays plain text. */
export function NoteMarkdown({ text }: { text: string }) {
  return (
    <div className="note-markdown">
      <Markdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={COMPONENTS}>{text}</Markdown>
    </div>
  );
}
