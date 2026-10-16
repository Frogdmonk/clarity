import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicEnv } from "./env";

const good = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(30),
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("getPublicEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a complete environment", () => {
    for (const [k, v] of Object.entries(good)) vi.stubEnv(k, v);
    expect(getPublicEnv().NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("names the missing variable and never echoes values", () => {
    for (const [k, v] of Object.entries(good)) vi.stubEnv(k, v);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => getPublicEnv()).not.toThrowError(/xxxxxxxx/);
  });

  it("rejects a too-short anon key", () => {
    for (const [k, v] of Object.entries(good)) vi.stubEnv(k, v);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "short");
    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
