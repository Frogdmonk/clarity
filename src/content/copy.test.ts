import { describe, expect, it } from "vitest";
import { copy, errorMessage } from "./copy";

const BANNED = [/\bweak\b/i, /\bbehind\b/i, /\bfailed\b/i, /\bslow\b/i, /should have/i, /\bstupid\b/i];

function collect(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "function") {
    try {
      out.push(String((v as (...a: never[]) => unknown)(...([3, "Topic"] as never[]))));
    } catch {
      /* functions with other signatures are covered by their literal outputs elsewhere */
    }
  } else if (Array.isArray(v)) v.forEach((x) => collect(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, out));
  return out;
}

describe("copy deck", () => {
  it("contains no banned, judgemental words", () => {
    for (const s of collect(copy)) for (const re of BANNED) expect(s, s).not.toMatch(re);
  });
  it("maps unknown error codes to the generic message", () => {
    expect(errorMessage("something_new")).toBe(copy.errors.generic);
    expect(errorMessage(undefined)).toBe(copy.errors.generic);
  });
  it("gives the exact masked-anonymity promise from the design doc", () => {
    expect(copy.anon.masked).toContain("Classmates never see who asked.");
    expect(copy.anon.strict).toContain("it's recorded");
  });
});
