/** One line of papers/<id>/activity.jsonl (activity log spec): what the reader did, when, in a few fields. */
export type ActivityKind = "session" | "build" | "read" | "ai";
export type ActivityDetail = Record<string, unknown>;
export type ActivityEvent = { t: string; kind: ActivityKind; action: string; detail: ActivityDetail };
