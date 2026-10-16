import { describe, expect, it } from "vitest";
import { isValidUg, normaliseUg } from "./ug";

describe("UG validation", () => {
  it.each([
    ["UG/24/00123", true],
    ["ug/24/00123", true], // normalised, not rejected
    ["  UG/24/00123  ", true], // whitespace trimmed
    ["UG/24/0123", false], // 4 digits
    ["UG/24/001234", false], // 6 digits
    ["UG-24-00123", false], // hyphens
    ["XX/24/00123", false], // wrong prefix
    ["UG/2/00123", false],
    ["", false],
    ["UG/24/00 123", false], // inner whitespace is NOT silently removed
  ])("%j -> %s", (input, expected) => {
    expect(isValidUg(input)).toBe(expected);
  });

  it("normalises without altering digits or separators", () => {
    expect(normaliseUg(" ug/24/00123 ")).toBe("UG/24/00123");
    expect(normaliseUg("UG-24-00123")).toBe("UG-24-00123");
  });
});
