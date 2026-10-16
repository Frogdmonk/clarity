import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftSaver, NetworkError, RpcCodeError, type SaveResult, type SaverDeps, type ServerDraft } from "./saver";

function setup(save: SaverDeps["save"], init = { code: "", baseRev: 0 as number, unsynced: false }) {
  const puts: { code: string; dirty: boolean }[] = [];
  const park = vi.fn(async () => {});
  const deps: SaverDeps = {
    save,
    park,
    putLocal: async (d) => { puts.push({ code: d.code, dirty: d.dirty }); },
    deviceId: "dev1",
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    random: () => 0.5,
    now: () => Date.now(),
  };
  return { saver: new DraftSaver(deps, init), puts, park, deps };
}
const ok = (rev: number): SaveResult => ({ conflict: false, rev, saved_at: "2026-10-16T10:00:00Z" });
const server: ServerDraft = { code: "theirs", rev: 7, saved_at: "2026-10-16T10:01:00Z", device_id: "dev2" };

describe("DraftSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces: many edits produce one save with the latest code", async () => {
    const save = vi.fn(async () => ok(1));
    const { saver } = setup(save);
    saver.edit("a"); saver.edit("ab"); saver.edit("abc");
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("abc", 0, "dev1");
    expect(saver.getSnapshot().status.kind).toBe("saved");
    expect(saver.getSnapshot().baseRev).toBe(1);
  });

  it("maxWait forces a save during continuous typing", async () => {
    const save = vi.fn(async () => ok(1));
    const { saver } = setup(save);
    for (let i = 0; i < 20; i++) {
      saver.edit("x".repeat(i + 1));
      await vi.advanceTimersByTimeAsync(700); // never idle for the full 800 ms
    }
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("writes every edit to the local buffer immediately", async () => {
    const { saver, puts } = setup(async () => ok(1));
    saver.edit("hello");
    expect(puts[0]).toEqual({ code: "hello", dirty: true });
  });

  it("an edit made while saving triggers a second save with the newer text", async () => {
    let release: (r: SaveResult) => void = () => {};
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<SaveResult>((r) => { release = r; }))
      .mockImplementation(async () => ok(2));
    const { saver } = setup(save);
    saver.edit("one");
    await vi.advanceTimersByTimeAsync(800);
    saver.edit("one two");
    release(ok(1));
    await vi.advanceTimersByTimeAsync(900);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("one two", 1, "dev1");
  });

  it("conflict: stops saving, keeps the student's text, never overwrites", async () => {
    const save = vi.fn(async (): Promise<SaveResult> => ({ conflict: true, server }));
    const { saver } = setup(save, { code: "", baseRev: 3, unsynced: false });
    saver.edit("mine");
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.getSnapshot().status.kind).toBe("conflict");
    saver.edit("mine, still typing");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.getSnapshot().code).toBe("mine, still typing");
  });

  it("conflict -> keep mine re-saves on top of the server revision", async () => {
    const save = vi.fn()
      .mockResolvedValueOnce({ conflict: true, server })
      .mockResolvedValueOnce(ok(8));
    const { saver } = setup(save);
    saver.edit("mine");
    await vi.advanceTimersByTimeAsync(800);
    await saver.resolve("keep_mine");
    expect(save).toHaveBeenLastCalledWith("mine", 7, "dev1");
    expect(saver.getSnapshot().baseRev).toBe(8);
  });

  it("conflict -> take theirs replaces the text and adopts their revision", async () => {
    const save = vi.fn(async (): Promise<SaveResult> => ({ conflict: true, server }));
    const { saver } = setup(save);
    saver.edit("mine");
    await vi.advanceTimersByTimeAsync(800);
    await saver.resolve("take_theirs");
    expect(saver.getSnapshot()).toMatchObject({ code: "theirs", baseRev: 7 });
    expect(saver.getSnapshot().status.kind).toBe("saved");
  });

  it("conflict -> park then theirs saves mine as a snapshot first", async () => {
    const save = vi.fn(async (): Promise<SaveResult> => ({ conflict: true, server }));
    const { saver, park } = setup(save);
    saver.edit("mine");
    await vi.advanceTimersByTimeAsync(800);
    await saver.resolve("park_then_theirs");
    expect(park).toHaveBeenCalledWith("mine");
    expect(saver.getSnapshot().code).toBe("theirs");
  });

  it("if parking fails the student's text is NOT discarded", async () => {
    const save = vi.fn(async (): Promise<SaveResult> => ({ conflict: true, server }));
    const { saver, park } = setup(save);
    park.mockRejectedValueOnce(new NetworkError("offline"));
    saver.edit("mine");
    await vi.advanceTimersByTimeAsync(800);
    await saver.resolve("park_then_theirs");
    expect(saver.getSnapshot().code).toBe("mine");
  });

  it("offline: shows offline, retries with backoff, recovers without data loss", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new NetworkError("down"))
      .mockRejectedValueOnce(new NetworkError("down"))
      .mockResolvedValueOnce(ok(1));
    const { saver } = setup(save);
    saver.edit("work");
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.getSnapshot().status.kind).toBe("offline");
    await vi.advanceTimersByTimeAsync(1000); // retry 1 (1 s)
    expect(saver.getSnapshot().status.kind).toBe("offline");
    await vi.advanceTimersByTimeAsync(2000); // retry 2 (2 s)
    expect(saver.getSnapshot().status.kind).toBe("saved");
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith("work", 0, "dev1");
  });

  it("online event retries immediately", async () => {
    const save = vi.fn().mockRejectedValueOnce(new NetworkError("down")).mockResolvedValueOnce(ok(1));
    const { saver } = setup(save);
    saver.edit("w");
    await vi.advanceTimersByTimeAsync(800);
    saver.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.getSnapshot().status.kind).toBe("saved");
  });

  it("non-retryable server codes surface as an error with the local copy intact", async () => {
    const save = vi.fn().mockRejectedValue(new RpcCodeError("activity_closed"));
    const { saver } = setup(save);
    saver.edit("late");
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.getSnapshot().status).toEqual({ kind: "error", code: "activity_closed" });
    expect(saver.getSnapshot().code).toBe("late");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("recovered unsynced local work is flushed on start", async () => {
    const save = vi.fn(async () => ok(5));
    const { saver } = setup(save, { code: "recovered", baseRev: 4, unsynced: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith("recovered", 4, "dev1");
    expect(saver.getSnapshot().baseRev).toBe(5);
  });
});
