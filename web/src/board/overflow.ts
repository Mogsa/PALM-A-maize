import { useEffect, useRef, useState } from "react";

export const OVERFLOW_SLACK_PX = 2;

export function isOverflowing(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight - clientHeight > OVERFLOW_SLACK_PX;
}

/** Whether an element's content is taller than its box, kept current as the box resizes. */
export function useOverflow<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(isOverflowing(el.scrollHeight, el.clientHeight));
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  });
  return [ref, overflowing];
}
