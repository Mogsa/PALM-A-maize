import { useAi } from "./AiProvider";
import { slotSpans } from "./terms";

/** 📍 beside a slot's question (spec B5): outlines where the AI thinks the paper answers it. Writes nothing. */
export function SlotPin({ slot }: { slot: string }) {
  const { ai, outlined, toggleSlot } = useAi();
  const spans = slotSpans(ai, slot);
  if (!spans) return null;
  return (
    <button type="button" className={`slot-pin nodrag ${outlined?.slot === slot ? "on" : ""}`} aria-label="Where the paper answers this (AI)"
            title="Where the paper answers this (AI)" onClick={(e) => { e.stopPropagation(); toggleSlot(spans); }}>📍</button>
  );
}
