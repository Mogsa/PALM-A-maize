import { afterEach, describe, expect, it, vi } from "vitest";
import { BATCH_MAX, createActivityLog } from "./logger";
import type { ActivityEvent } from "./types";

const at = new Date("2026-09-30T10:42:03.120Z");
const setup = (on = true) => {
  const sent: { events: ActivityEvent[]; keepalive: boolean }[] = [];
  const send = vi.fn(async (events: ActivityEvent[], keepalive: boolean) => { sent.push({ events, keepalive }); });
  const enabled = { on };
  const log = createActivityLog({ send, enabled: () => enabled.on, now: () => at });
  return { log, send, sent, enabled };
};

afterEach(() => vi.restoreAllMocks());

describe("the activity logger", () => {
  it("queues an event with its ISO time and sends the queue on flush", async () => {
    const { log, sent } = setup();
    log.log("build", "highlight", { id: "h-1", text: "regret", tags: [] });
    log.log("read", "view", { view: "board" });
    expect(sent).toEqual([]);   // nothing until a flush
    await log.flush();
    expect(sent).toEqual([{ keepalive: false, events: [
      { t: "2026-09-30T10:42:03.120Z", kind: "build", action: "highlight", detail: { id: "h-1", text: "regret", tags: [] } },
      { t: "2026-09-30T10:42:03.120Z", kind: "read", action: "view", detail: { view: "board" } },
    ] }]);
  });

  it("gives an event with no detail an empty one", async () => {
    const { log, sent } = setup();
    log.log("session", "open");
    await log.flush(true);
    expect(sent[0]).toEqual({ keepalive: true, events: [{ t: at.toISOString(), kind: "session", action: "open", detail: {} }] });
  });

  it("sends nothing when the queue is empty", async () => {
    const { log, send } = setup();
    await log.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends at once when the queue reaches the batch size", async () => {
    const { log, send, sent } = setup();
    for (let i = 0; i < BATCH_MAX - 1; i++) log.log("ai", "on");
    expect(send).not.toHaveBeenCalled();
    log.log("ai", "off");
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(sent[0].events).toHaveLength(BATCH_MAX);
  });

  it("queues nothing while the paper's log is off", async () => {
    const { log, send, enabled } = setup(false);
    log.log("build", "undo");
    await log.flush();
    expect(send).not.toHaveBeenCalled();
    enabled.on = true;
    log.log("build", "redo");
    await log.flush();
    expect(send.mock.calls[0][0].map((e) => e.action)).toEqual(["redo"]);
  });

  it("keeps a failed send and tries it once more on the next flush, before newer events", async () => {
    const { log, send, sent } = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    send.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    log.log("build", "undo");
    await log.flush();
    log.log("build", "redo");
    await log.flush();
    expect(sent.at(-1)!.events.map((e) => e.action)).toEqual(["undo", "redo"]);
  });

  it("drops an event that failed twice, with a console error, and keeps the newer ones for their retry", async () => {
    const { log, send, sent } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    send.mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down"));
    log.log("build", "undo");
    await log.flush();
    log.log("build", "redo");
    await log.flush();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("1 activity event"), expect.any(Error));
    await log.flush();
    expect(sent.at(-1)!.events.map((e) => e.action)).toEqual(["redo"]);
  });

  it("never throws into the caller: not from a send that throws at once, nor from a bad clock", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = createActivityLog({ send: () => { throw new Error("not a function"); }, enabled: () => true });
    log.log("build", "undo");
    await expect(log.flush()).resolves.toBeUndefined();
    const broken = createActivityLog({ send: async () => undefined, enabled: () => true, now: () => { throw new Error("clock"); } });
    expect(() => broken.log("build", "undo")).not.toThrow();
  });

  it("does not send the same events twice when flushes overlap", async () => {
    const { log, send } = setup();
    log.log("build", "undo");
    await Promise.all([log.flush(), log.flush()]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
