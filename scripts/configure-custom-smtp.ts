/**
 * Configures a custom SMTP provider (Resend, by default) for this
 * Supabase project's auth emails. Without this, Supabase's built-in
 * mailer (noreply@mail.app.supabase.io) **refuses to deliver to any
 * address outside this project's own Supabase organization team** --
 * confirmed via Supabase's own docs (auth-smtp.md): "Unless you configure
 * a custom SMTP server... Supabase Auth will refuse to deliver messages
 * to addresses that are not part of the project's team." That means, as
 * shipped, NO real end user (web or iOS -- same Supabase Auth instance,
 * same mailer, for both) can currently receive an auth email of any kind
 * (OTP, magic link, password reset, signup confirmation). This is
 * separate from -- and more urgent than -- update-auth-email-template.ts's
 * fix, which only matters once mail can actually reach real users.
 *
 * Uses the Supabase Management API directly -- no CLI/MCP wrapper exists
 * for SMTP settings. See https://supabase.com/docs/guides/auth/auth-smtp.
 *
 * Requires SUPABASE_ACCESS_TOKEN (already a repo secret), RESEND_API_KEY
 * (used as the SMTP password -- Resend's documented SMTP relay: host
 * smtp.resend.com, username literally "resend"), and SMTP_SENDER_EMAIL
 * (a sending address on a domain verified in Resend -- an unverified
 * domain will fail to send even once this is applied). Optionally
 * SUPABASE_PROJECT_REF and SMTP_SENDER_NAME.
 *
 * Usage: node_modules/.bin/tsx scripts/configure-custom-smtp.ts
 */
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "qhcjpfbxfcltjbiuknyt";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDER_EMAIL = process.env.SMTP_SENDER_EMAIL;
const SENDER_NAME = process.env.SMTP_SENDER_NAME || "Alphonso";

const missing = [
  !ACCESS_TOKEN && "SUPABASE_ACCESS_TOKEN",
  !RESEND_API_KEY && "RESEND_API_KEY",
  !SENDER_EMAIL && "SMTP_SENDER_EMAIL",
].filter(Boolean);
if (missing.length > 0) {
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_email_enabled: true,
      smtp_admin_email: SENDER_EMAIL,
      smtp_host: "smtp.resend.com",
      smtp_port: 587,
      smtp_user: "resend",
      smtp_pass: RESEND_API_KEY,
      smtp_sender_name: SENDER_NAME,
    }),
  });
  if (!res.ok) {
    console.error(`Failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  console.log("Configured Resend as the custom SMTP provider for Supabase Auth emails.");
}

main();
