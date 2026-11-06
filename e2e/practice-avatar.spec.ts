import { expect, test } from "@playwright/test";

/**
 * The talking Alphonso in the Practice speaking screen: the stage renders with its art loaded from this origin and
 * is hidden from assistive technology. Needs the same throwaway local Supabase stack as signed-in.spec.ts (CI job
 * `e2e-signed-in`) and skips without one.
 */
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

if (SUPABASE_URL && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPABASE_URL)) {
  throw new Error(`E2E_SUPABASE_URL must be a local stack, got ${new URL(SUPABASE_URL).host}`);
}
test.skip(!SUPABASE_URL || !SERVICE_KEY, "needs a local Supabase stack");

const email = `e2e-avatar-${Date.now()}@example.test`;
const password = `E2e-${crypto.randomUUID()}`;
let userId = "";

async function admin(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

test.beforeAll(async () => {
  const user = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  userId = user.id;
  // AI features need the account's consent; a server role may stamp it.
  await admin(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ ai_consent_at: new Date().toISOString(), display_name: "Robin Tester" }),
  });
});

test.afterAll(async () => {
  if (userId) await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
});

test("Alphonso appears in a speaking conversation, drawn from this origin, and is hidden from assistive technology", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() =>
    window.localStorage.setItem("lingua.cookie-consent.v1", "essential"),
  );
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/learn/, { timeout: 30_000 });

  await page.goto("/converse/coffee");
  const stage = page.getByTestId("alphonso-stage");
  await expect(stage).toBeAttached({ timeout: 30_000 });
  await expect(stage).toHaveAttribute("aria-hidden", "true");

  // Every layer loaded from this origin (the CSP's img-src 'self') and decoded.
  const layers = stage.locator("img");
  await expect(layers).toHaveCount(14);
  await expect
    .poll(async () =>
      layers.evaluateAll((imgs) =>
        imgs.every(
          (img) =>
            (img as HTMLImageElement).complete &&
            (img as HTMLImageElement).naturalWidth > 0 &&
            new URL((img as HTMLImageElement).src).origin === location.origin,
        ),
      ),
    )
    .toBe(true);

  // Not in the accessibility tree: no image of him is announced.
  await expect(page.getByRole("img", { name: /alphonso|llama/i })).toHaveCount(0);
  expect(await page.locator("body").ariaSnapshot()).not.toContain("webp");

  // Turning the setting off removes him and leaves the conversation as it was.
  await page.evaluate(() => localStorage.setItem("showAlphonsoWhilePractising", "false"));
  await page.reload();
  await expect(page.getByRole("log")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("alphonso-stage")).toHaveCount(0);
});
