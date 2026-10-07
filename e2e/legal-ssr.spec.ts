// e2e/legal-ssr.spec.ts
import { test, expect } from "@playwright/test";
import {
  LEGAL_FORBIDDEN_PHRASES,
  LEGAL_REQUIRED_PHRASES,
  htmlToText,
  type LegalPath,
} from "../src/lib/legal-required-phrases";

/**
 * App Review, crawlers and `curl` read the server's HTML, not the hydrated
 * DOM. `request.get` is a plain HTTP GET: no browser, no JavaScript. A
 * route that ever switches to client-only rendering (ssr: false) returns a
 * shell with an empty body, and every "says ..." case here goes red.
 */
for (const path of Object.keys(LEGAL_REQUIRED_PHRASES) as LegalPath[]) {
  test(`${path}: the server HTML carries the full text without JavaScript`, async ({ request }) => {
    const res = await request.get(path, { headers: { accept: "text/html" }, maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    const text = htmlToText(await res.text());
    for (const phrase of LEGAL_REQUIRED_PHRASES[path]) {
      expect(text, `server HTML for ${path} is missing: ${phrase}`).toContain(phrase);
    }
    for (const phrase of LEGAL_FORBIDDEN_PHRASES[path]) {
      expect(text, `server HTML for ${path} still says: ${phrase}`).not.toContain(phrase);
    }
  });
}

test("legal and landing HTML contain no raw NUL bytes", async ({ request }) => {
  for (const path of ["/", "/terms", "/privacy", "/cookies", "/support"]) {
    const body = await (await request.get(path, { headers: { accept: "text/html" } })).body();
    expect(body.includes(0), `${path} still contains a raw NUL byte`).toBe(false);
  }
});

test("pages still hydrate after the NUL escaping", async ({ page }) => {
  // The cookie banner opens only from a client useEffect (CookieConsent.tsx),
  // so it appearing proves React hydrated the server HTML.
  await page.goto("/terms");
  await expect(page.getByRole("dialog", { name: "Cookie choices" })).toBeVisible();
  await page.getByRole("button", { name: "Essential only" }).click();
  await expect(page.getByRole("dialog", { name: "Cookie choices" })).toBeHidden();
});
