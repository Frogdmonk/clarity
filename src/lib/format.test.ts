import { describe, expect, it } from "vitest";
import { pct, waitLabel } from "./format";

describe("format", () => {
  it("pct handles zero totals", () => {
    expect(pct(3, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33);
  });
  it("waitLabel", () => {
    const now = Date.parse("2026-10-16T10:00:00Z");
    expect(waitLabel("2026-10-16T09:59:50Z", now)).toBe("just now");
    expect(waitLabel("2026-10-16T09:55:00Z", now)).toBe("5m");
    expect(waitLabel("2026-10-16T08:30:00Z", now)).toBe("1h 30m");
  });
});
