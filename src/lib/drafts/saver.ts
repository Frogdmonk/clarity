/**
 * Draft save engine (design doc 8.4). Framework-agnostic so it can be unit-tested.
 * Rules: local copy first (cheap), debounced server save with compare-and-swap, never auto-discard
 * on conflict, retry with exponential backoff + jitter when offline.
 */
export interface ServerDraft { code: string; rev: number; saved_at: string; device_id: string | null }
export type SaveResult =
  | { conflict: false; rev: number; saved_at: string }
  | { conflict: true; server: ServerDraft };

export class NetworkError extends Error {}
export class RpcCodeError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export type DraftStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "offline" }
  | { kind: "error"; code: string }
  | { kind: "conflict"; server: ServerDraft };

export interface DraftView { code: string; baseRev: number; status: DraftStatus }
export interface LocalDraft { code: string; baseRev: number; dirty: boolean; updatedAt: number }
export type ConflictChoice = "keep_mine" | "take_theirs" | "park_then_theirs";

export interface SaverDeps {
  save(code: string, baseRev: number, deviceId: string): Promise<SaveResult>;
  park(code: string): Promise<void>;
  putLocal(d: LocalDraft): Promise<void>;
  deviceId: string;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  random(): number;
  now(): number;
  debounceMs?: number;
  maxWaitMs?: number;
}

export class DraftSaver {
  private code: string;
  private baseRev: number;
  private savedCode: string;
  private status: DraftStatus = { kind: "idle" };
  private timer: unknown = null;
  private retryTimer: unknown = null;
  private firstDirtyAt: number | null = null;
  private retries = 0;
  private saving = false;
  private again = false;
  private disposed = false;
  private listeners = new Set<() => void>();
  private view: DraftView;

  constructor(private readonly deps: SaverDeps, init: { code: string; baseRev: number; unsynced?: boolean }) {
    this.code = init.code;
    this.baseRev = init.baseRev;
    this.savedCode = init.unsynced ? "\u0000unsynced" : init.code;
    this.view = this.makeView();
    if (init.unsynced) {
      this.status = { kind: "dirty" };
      this.view = this.makeView();
      void this.flush();
    }
  }

  get debounce(): number { return this.deps.debounceMs ?? 800; }
  get maxWait(): number { return this.deps.maxWaitMs ?? 8000; }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): DraftView => this.view;

  private makeView(): DraftView {
    return { code: this.code, baseRev: this.baseRev, status: this.status };
  }
  private emit(): void {
    this.view = this.makeView();
    this.listeners.forEach((l) => l());
  }
  private setStatus(s: DraftStatus): void {
    this.status = s;
    this.emit();
  }

  /** Editor change: persist locally right away, schedule a debounced server save. */
  edit(code: string): void {
    if (this.disposed || code === this.code) return;
    this.code = code;
    void this.deps.putLocal({ code, baseRev: this.baseRev, dirty: true, updatedAt: this.deps.now() });
    if (this.status.kind === "conflict") {
      this.emit(); // keep typing; nothing is sent until the student resolves the conflict
      return;
    }
    if (this.status.kind !== "saving") this.setStatus({ kind: "dirty" });
    else this.emit();
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) this.deps.clearTimer(this.timer);
    const now = this.deps.now();
    if (this.firstDirtyAt === null) this.firstDirtyAt = now;
    const remainingMax = Math.max(0, this.maxWait - (now - this.firstDirtyAt));
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.runSave();
    }, Math.min(this.debounce, remainingMax));
  }

  /** Immediate save (blur, hidden tab, explicit Save, Submit, opening Ask). */
  async flush(): Promise<void> {
    if (this.timer) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
    await this.runSave();
  }

  /** Browser came back online: retry now. */
  online(): void {
    if (this.status.kind === "offline" || (this.status.kind === "error" && this.status.code === "rate_limited")) {
      void this.flush();
    }
  }

  private async runSave(): Promise<void> {
    if (this.disposed || this.status.kind === "conflict") return;
    if (this.saving) {
      this.again = true;
      return;
    }
    if (this.code === this.savedCode && this.status.kind !== "dirty" && this.status.kind !== "offline") return;
    this.saving = true;
    this.firstDirtyAt = null;
    const sending = this.code;
    this.setStatus({ kind: "saving" });
    try {
      const res = await this.deps.save(sending, this.baseRev, this.deps.deviceId);
      if (res.conflict) {
        this.setStatus({ kind: "conflict", server: res.server });
        return;
      }
      this.baseRev = res.rev;
      this.savedCode = sending;
      this.retries = 0;
      const changed = this.code !== sending;
      await this.deps.putLocal({ code: this.code, baseRev: this.baseRev, dirty: changed, updatedAt: this.deps.now() });
      if (changed) {
        this.setStatus({ kind: "dirty" });
        this.schedule();
      } else {
        this.setStatus({ kind: "saved", at: res.saved_at });
      }
    } catch (e) {
      if (e instanceof RpcCodeError && e.code !== "rate_limited") {
        this.setStatus({ kind: "error", code: e.code });
      } else {
        const rate = e instanceof RpcCodeError;
        this.setStatus(rate ? { kind: "error", code: "rate_limited" } : { kind: "offline" });
        this.scheduleRetry();
      }
    } finally {
      this.saving = false;
      if (this.again) {
        this.again = false;
        if (!this.isConflict()) void this.runSave();
      }
    }
  }

  private isConflict(): boolean {
    return this.status.kind === "conflict"; // method call defeats stale control-flow narrowing
  }

  private scheduleRetry(): void {
    if (this.retryTimer) this.deps.clearTimer(this.retryTimer);
    const base = Math.min(30_000, 1000 * 2 ** this.retries);
    const delay = Math.round(base * (0.8 + 0.4 * this.deps.random()));
    this.retries += 1;
    this.retryTimer = this.deps.setTimer(() => {
      this.retryTimer = null;
      void this.runSave();
    }, delay);
  }

  /** Conflict dialog outcomes. Never auto-discards: every path keeps the student's text reachable. */
  async resolve(choice: ConflictChoice): Promise<void> {
    if (this.status.kind !== "conflict") return;
    const server = this.status.server;
    if (choice === "keep_mine") {
      this.baseRev = server.rev;
      this.setStatus({ kind: "dirty" });
      await this.flush();
      return;
    }
    if (choice === "park_then_theirs") {
      try {
        await this.deps.park(this.code);
      } catch (e) {
        this.setStatus({ kind: "error", code: e instanceof RpcCodeError ? e.code : "network" });
        return;
      }
    }
    this.code = server.code;
    this.savedCode = server.code;
    this.baseRev = server.rev;
    await this.deps.putLocal({ code: server.code, baseRev: server.rev, dirty: false, updatedAt: this.deps.now() });
    this.setStatus({ kind: "saved", at: server.saved_at });
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) this.deps.clearTimer(this.timer);
    if (this.retryTimer) this.deps.clearTimer(this.retryTimer);
  }
}
