/**
 * Fixes a real production bug: iOS's email-OTP sign-in flow
 * (SupabaseAuthClient.requestEmailOTP -> POST /auth/v1/otp) shares
 * Supabase's single "Magic Link" email template with every OTP request.
 * That template ships, by default, showing only a clickable confirmation
 * link (no visible `{{ .Token }}`) -- so an iOS user who's asked to type
 * in a 6-digit code never receives one; they get a link instead, which
 * (since the app has no deep-link handler for it) is also a dead end
 * when clicked. Confirmed live via this project's auth logs: the /otp
 * request logs `"mail_type":"magic_link"`.
 *
 * Uses the Supabase Management API directly -- no CLI/MCP wrapper exists
 * for auth email templates. See
 * https://supabase.com/docs/guides/auth/auth-email-templates#editing-email-templates.
 *
 * Requires SUPABASE_ACCESS_TOKEN (already a repo secret, the same one
 * deploy-supabase's `supabase link`/`db push` steps use) and, optionally,
 * SUPABASE_PROJECT_REF (defaults to this repo's one linked project).
 *
 * Usage: node_modules/.bin/tsx scripts/update-auth-email-template.ts
 */
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "qhcjpfbxfcltjbiuknyt";

if (!ACCESS_TOKEN) {
  console.error("Missing environment variable: SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

/**
 * One body for both templates. The learner cannot tell whether Supabase
 * treated this as a sign-in or a signup, so the mail must not either --
 * and a single constant makes it impossible to fix one and forget the
 * other, which is exactly what happened the first time.
 */
const CODE_EMAIL =
  "<h2>Your sign-in code</h2>" +
  "<p>Enter this code in the app to sign in:</p>" +
  '<p style="font-size:32px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>' +
  "<p>This code expires shortly and can only be used once. If you didn't request this, you can safely ignore this email.</p>" +
  '<p>Prefer a link? <a href="{{ .ConfirmationURL }}">Click here to sign in instead</a>.</p>';

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Returning users: the address already has a confirmed user.
      mailer_subjects_magic_link: "{{ .Token }} is your Alphonso sign-in code",
      mailer_templates_magic_link_content: CODE_EMAIL,
      // First-time users: Supabase sends THIS one instead, and shipping
      // it without {{ .Token }} is what broke every new signup.
      mailer_subjects_confirmation: "{{ .Token }} is your Alphonso sign-in code",
      mailer_templates_confirmation_content: CODE_EMAIL,
    }),
  });
  if (!res.ok) {
    console.error(`Failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  console.log("Updated BOTH the magic-link and confirm-signup templates to show the 6-digit code.");
}

main();
