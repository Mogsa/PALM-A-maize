import type { ActivityDetail, ActivityEvent } from "./types";

/** Words quoted in a sentence are cut to this, so each event stays one line. */
export const QUOTE_CHARS = 80;

const text = (d: ActivityDetail, key: string): string => (typeof d[key] === "string" ? (d[key] as string) : "");
const list = (d: ActivityDetail, key: string): unknown[] => (Array.isArray(d[key]) ? (d[key] as unknown[]) : []);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function quote(words: string): string {
  const flat = words.replace(/\s+/g, " ").trim();
  return `“${flat.length > QUOTE_CHARS ? `${flat.slice(0, QUOTE_CHARS - 1).trimEnd()}…` : flat}”`;
}

/** What an id names, by its kind's prefix (model/ids). */
function thing(id: string): string {
  if (id.startsWith("h-")) return "a highlight";
  if (id.startsWith("e-")) return "a connection";
  return "a piece";
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)} min${rest ? ` ${rest} s` : ""}`;
}

const VIEWS: Record<string, string> = { paper: "the paper", board: "the board", both: "the paper and board side by side" };

function tagSentence(d: ActivityDetail, tagName: (id: string) => string | undefined): string {
  const tags = list(d, "tags").map(String);
  if (!tags.length) return `Took the tags off ${thing(text(d, "id"))}`;
  const names = tags.map(tagName).filter((n): n is string => Boolean(n));
  return `Tagged ${thing(text(d, "id"))} ${names.length ? names.join(", ") : "with a deleted tag"}`;
}

function build(e: ActivityEvent, tagName: (id: string) => string | undefined): string | null {
  const d = e.detail;
  const pieces = list(d, "ids").length;
  switch (e.action) {
    case "highlight": return `Highlighted ${quote(text(d, "text"))}`;
    case "cut": return text(d, "text") ? `Cut ${quote(text(d, "text"))} onto the board` : "Cut a piece onto the board";
    case "note": return text(d, "text") ? `Wrote a note: ${quote(text(d, "text"))}` : "Emptied a note";
    case "connect": return "Connected two things";
    case "group": return `Grouped ${count(list(d, "members").length, "piece")}${text(d, "name") ? ` as ${quote(text(d, "name"))}` : ""}`;
    case "tag": return tagSentence(d, tagName);
    case "remove": return `Deleted ${count(pieces, "thing")}`;
    case "split": return `Split a chunk in ${pieces <= 2 ? "two" : pieces}`;
    case "cutout": return "Cut out part of a chunk";
    case "join": return `Joined ${count(pieces, "chunk")}`;
    case "undo": return "Undid a change";
    case "redo": return "Redid a change";
    default: return null;
  }
}

function other(e: ActivityEvent): string | null {
  const d = e.detail;
  switch (`${e.kind}:${e.action}`) {
    case "session:open": return "Opened the paper";
    case "session:close": return "Left the paper";
    case "read:view": return `Switched to ${VIEWS[text(d, "view")] ?? "another view"}`;
    case "read:page": return `Read page ${Number(d.page)} for ${duration(Number(d.seconds))}`;
    case "read:find": return `Searched the paper for ${quote(text(d, "text"))}`;
    case "ai:on": return "Turned AI help on";
    case "ai:off": return "Turned AI help off";
    case "ai:define": return `Asked AI to define ${quote(text(d, "word"))}`;
    case "ai:key-sentences": return "Opened the key sentences";
    case "ai:jump": return `Went to a key sentence: ${quote(text(d, "text"))}`;
    case "ai:keep": return d.slot ? `Kept a key sentence: ${quote(text(d, "text"))}` : `Kept the AI term ${quote(text(d, "text"))}`;
    default: return null;
  }
}

/** One plain sentence for an event in the Activity panel. A line the log may hold from a later version, or with
 *  fields missing, still says something. `tagName` turns a tag id into its name. */
export function describeEvent(e: ActivityEvent, tagName: (id: string) => string | undefined): string {
  const sentence = e.kind === "build" ? build(e, tagName) : other(e);
  return sentence ?? `${e.kind}: ${e.action}`;
}

/** An event's time as HH:MM, in the reader's own time zone. */
export function clock(t: string): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
