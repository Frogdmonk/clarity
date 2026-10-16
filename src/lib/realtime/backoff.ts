/** Exponential backoff 1s, 2s, 4s ... capped at 30s, with +/-20% jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + 0.4 * random()));
}

/** Idempotent event handling: ignore anything not newer than what we already applied. */
export function isStale(lastVersion: number | undefined, incoming: unknown): boolean {
  return typeof incoming === "number" && lastVersion !== undefined && incoming <= lastVersion;
}
