/**
 * Mints a real Supabase session for the seeded demo account, non-
 * interactively, for the App Store screenshot pipeline
 * (.github/workflows/capture-app-store-screenshots.yml) to hand to
 * Session.uiTestBootstrapSession via launch environment variables.
 *
 * There is no live email inbox in CI to receive a real OTP code, so this
 * uses GoTrue's admin `generateLink` (type: magiclink) to get a
 * `hashed_token` server-side, then exchanges it the same way the app's
 * own email-code sign-in does (SupabaseAuthClient.verifyEmailOTP,
 * `POST /auth/v1/verify`) to get real access/refresh tokens -- this is a
 * real session for the real seeded account, not a fabricated one.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role --
 * same convention as seed-curriculum-db.ts / seed-demo-account.ts).
 *
 * Usage:
 *   bun scripts/mint-demo-session.ts --email reviewer@example.com
 *
 * Prints plain `NAME=value` lines (UI_TEST_ACCESS_TOKEN /
 * UI_TEST_REFRESH_TOKEN / UI_TEST_USER_ID / UI_TEST_EXPIRES_AT) to
 * stdout, one per line, nothing else -- the same format GitHub Actions'
 * $GITHUB_ENV expects, so a workflow step can do
 * `bun scripts/mint-demo-session.ts --email ... >> "$GITHUB_ENV"`
 * directly (see .github/workflows/capture-app-store-screenshots.yml).
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  const missing = [
    ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
    ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
if (!email) {
  console.error("Usage: bun scripts/mint-demo-session.ts --email <address>");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main(): Promise<void> {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !linkData) {
    throw new Error(`Couldn't generate a magic link for ${email}: ${linkError?.message}`);
  }
  const hashedToken = linkData.properties.hashed_token;

  const verifyResponse = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ type: "magiclink", token: hashedToken }),
  });
  if (!verifyResponse.ok) {
    const text = await verifyResponse.text().catch(() => "");
    throw new Error(`Couldn't exchange the magic link token: ${verifyResponse.status} ${text}`);
  }
  const session = (await verifyResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    user?: { id?: string };
  };
  if (!session.access_token || !session.refresh_token || !session.user?.id) {
    throw new Error("Verify response was missing access_token/refresh_token/user.id");
  }

  console.log(`UI_TEST_ACCESS_TOKEN=${session.access_token}`);
  console.log(`UI_TEST_REFRESH_TOKEN=${session.refresh_token}`);
  console.log(`UI_TEST_USER_ID=${session.user.id}`);
  console.log(`UI_TEST_EXPIRES_AT=${session.expires_at ?? ""}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
