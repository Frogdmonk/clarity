import { describe, expect, it } from "vitest";
import { backoffDelay, isStale } from "./backoff";

describe("backoff", () => {
  it("doubles then caps at 30 s", () => {
    const mid = () => 0.5; // jitter factor exactly 1.0
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((a) => backoffDelay(a, mid))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
  it("jitter stays within +/-20%", () => {
    expect(backoffDelay(2, () => 0)).toBe(3200);
    expect(backoffDelay(2, () => 1)).toBe(4800);
  });
  it("ignores stale or duplicate versions", () => {
    expect(isStale(5, 5)).toBe(true);
    expect(isStale(5, 4)).toBe(true);
    expect(isStale(5, 6)).toBe(false);
    expect(isStale(undefined, 1)).toBe(false);
    expect(isStale(5, "x")).toBe(false);
  });
});
