import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * App Review sign-in helper: shows a fresh 6-digit sign-in code for the
 * demo account, so an App Store reviewer can sign in without access to the
 * demo account's mailbox.
 *
 * Why this exists (2026-09-29 pre-submission audit): the app's only
 * email sign-in is a code sent by email, and the review notes used to ask
 * the reviewer to email us for it. Reviewers generally reject rather than
 * wait on a human relay (Guideline 2.1). The review notes give them this
 * URL instead: tap "Send code" in the app, open the URL, enter the code.
 *
 * Scope is deliberately tiny:
 * - It can only ever produce a code for DEMO_ACCOUNT_EMAIL, never an
 *   address from the request.
 * - It is OFF (404) unless REVIEW_DEMO_CODE_KEY is set to a 32+ character
 *   secret, and the request's `key` matches it in constant time. Remove
 *   the env var after approval to switch it off.
 * - A wrong or missing key is a 404, indistinguishable from the route not
 *   existing.
 *
 * Opening the page mints a new code, which replaces the one the app's
 * "Send code" emailed -- hence "Send code first, then open this page".
 */
const MIN_KEY_LENGTH = 32;

// Compares SHA-256 digests so both sides are always 32 bytes: a plain
// length check first would leak the key's length through timing.
function keyMatches(expected: string, given: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(expected), digest(given));
}

function page(body: string, status: number): Response {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Learn with Alphonso - App Review</title></head><body style="font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}

export const Route = createFileRoute("/api/review-demo-code")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expectedKey = process.env.REVIEW_DEMO_CODE_KEY ?? "";
        const demoEmail = process.env.DEMO_ACCOUNT_EMAIL ?? "";
        const givenKey = new URL(request.url).searchParams.get("key") ?? "";

        if (
          expectedKey.length < MIN_KEY_LENGTH ||
          !demoEmail ||
          !keyMatches(expectedKey, givenKey)
        ) {
          return new Response("Not found", {
            status: 404,
            headers: { "Cache-Control": "no-store" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: demoEmail,
        });
        const code = data?.properties?.email_otp;
        if (error || !code) {
          console.error(
            "[review-demo-code] generateLink failed:",
            error?.message ?? "no email_otp",
          );
          return page(
            "<p>Couldn't create a sign-in code right now. Please reload this page.</p>",
            503,
          );
        }

        return page(
          `<h1 style="font-size:1.3rem">Demo account sign-in code</h1>
<p style="font-size:2.4rem;font-weight:700;letter-spacing:.3rem;margin:1rem 0">${code}</p>
<p>Enter this code in the app on the "Enter the code" screen. It replaces any code sent by email, so please tap <b>Send code</b> in the app <i>before</i> opening this page, and reload the page if you tap it again.</p>`,
          200,
        );
      },
    },
  },
});
