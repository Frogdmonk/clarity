import { describe, expect, it } from "vitest";
import { parseCsv, rosterRows } from "./csv";

describe("csv", () => {
  it("handles quotes, commas and CRLF", () => {
    expect(parseCsv('a,"b,c"\r\n"d ""x""",e\n')).toEqual([["a", "b,c"], ['d "x"', "e"]]);
  });
  it("skips header and blank lines", () => {
    expect(rosterRows("ug_number,full_name\n\nUG/20/12345,Ada Lovelace\n")).toEqual([{ ug_number: "UG/20/12345", full_name: "Ada Lovelace" }]);
  });
  it("works without header", () => {
    expect(rosterRows("UG/20/12345,Ada")).toHaveLength(1);
  });
});
