import { expect, test } from "@playwright/test";

// These specs need a running app + `supabase start` (see docs/KNOWN_LIMITATIONS.md: NOT VERIFIED).
test("login page renders and has security headers", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.headers()["content-security-policy"]).toContain("nonce-");
  expect(res?.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
});

test("protected routes redirect to login when signed out", async ({ page }) => {
  for (const path of ["/student", "/teacher", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("health endpoint answers without leaking details", async ({ request }) => {
  const res = await request.get("/api/health");
  expect([200, 503]).toContain(res.status());
  expect(Object.keys(await res.json())).toEqual(["ok"]);
});
