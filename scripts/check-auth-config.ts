/**
 * Reads the LIVE GoTrue auth config and asserts the invariants in
 * `src/lib/auth-config-guard.ts`. Read-only -- changes nothing.
 *
 * Runs post-merge in deploy-supabase, the same place and for the same
 * reason as the admin_users RLS check: this guards remote state that is
 * editable from a dashboard with no review and no diff, so nothing in a
 * pull request can catch it drifting.
 *
 * Usage: bunx tsx scripts/check-auth-config.ts
 * Requires SUPABASE_ACCESS_TOKEN (the secret deploy-supabase already holds).
 */
import { findAuthConfigProblems, type AuthConfig } from "../src/lib/auth-config-guard";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "qhcjpfbxfcltjbiuknyt";

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    // Fail, never skip. The admin_users RLS test spent weeks skipping
    // silently in a job that set no credentials while its own comment
    // claimed CI ran it. A guard that quietly does nothing is worse than
    // no guard, because it also buys confidence.
    console.error("Missing SUPABASE_ACCESS_TOKEN -- refusing to skip. This check must run.");
    process.exit(1);
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(`Could not read auth config (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const cfg = (await res.json()) as AuthConfig;
  const problems = findAuthConfigProblems(cfg);

  if (problems.length) {
    console.error("Auth configuration has drifted:");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("");
    console.error(
      "Re-apply with: gh workflow run configure-auth-emails.yml -f job=update-email-template",
    );
    console.error(
      "Then send a real signup to a fresh address and READ the mail -- this cannot prove delivery.",
    );
    process.exit(1);
  }

  console.log("Auth config OK:");
  console.log(`  site_url          = ${cfg.site_url}`);
  console.log(`  mailer_otp_length = ${cfg.mailer_otp_length}`);
  console.log("  both magic-link and confirm-signup templates render {{ .Token }}");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
