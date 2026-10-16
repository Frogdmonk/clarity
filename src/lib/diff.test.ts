import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("marks unchanged, added and removed lines", () => {
    const d = diffLines("a\nb\nc", "a\nx\nc\nd");
    expect(d.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "del:b", "add:x", "same:c", "add:d"]);
  });
  it("identical input is all 'same'", () => {
    expect(diffLines("x\ny", "x\ny").every((l) => l.kind === "same")).toBe(true);
  });
  it("handles empty sides", () => {
    expect(diffLines("", "a").some((l) => l.kind === "add")).toBe(true);
    expect(diffLines("a", "").some((l) => l.kind === "del")).toBe(true);
  });
});
