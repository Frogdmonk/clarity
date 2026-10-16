import { describe, expect, it } from "vitest";
import { parseJoinCode } from "./qr-scanner";

describe("parseJoinCode", () => {
  it("reads the code from a join URL", () => {
    expect(parseJoinCode("https://app.example/student/join?code=abc123")).toBe("ABC123");
  });
  it("accepts a bare code", () => {
    expect(parseJoinCode(" k7m2xq ")).toBe("K7M2XQ");
  });
  it("rejects junk", () => {
    expect(parseJoinCode("hello world")).toBeNull();
    expect(parseJoinCode("https://x.test/?code=")).toBeNull();
  });
});
