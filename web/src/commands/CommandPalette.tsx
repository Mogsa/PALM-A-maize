import { useRef, useState } from "react";
import { useDismiss } from "../ui/useDismiss";
import { filterCommands, type Command } from "./registry";

/** ⌘K (spec A1): one searchable list of every command. Arrows choose, Enter runs, Escape or a press outside closes. */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  const shown = filterCommands(commands, query);
  const run = (command: Command | undefined) => { if (!command) return; onClose(); command.run(); };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (event.key === "Enter") { event.preventDefault(); run(shown[active]); }
  };
  return (
    <div className="palette-backdrop">
      <div ref={box} className="palette" role="dialog" aria-label="Commands">
        <input autoFocus aria-label="Search commands" placeholder="Type a command" value={query} onKeyDown={onKey}
               onChange={(e) => { setQuery(e.target.value); setActive(0); }} />
        <ul role="listbox" aria-label="Commands">
          {shown.map((c, i) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={i === active} title={c.title} onMouseEnter={() => setActive(i)} onClick={() => run(c)}>{c.label}</button>
            </li>
          ))}
        </ul>
        {!shown.length && <p className="hint">No command matches.</p>}
      </div>
    </div>
  );
}
