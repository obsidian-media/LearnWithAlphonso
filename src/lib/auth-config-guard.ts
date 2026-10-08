/**
 * The invariants that make email sign-in work, as pure assertions over a
 * GoTrue auth config. Lives here rather than beside the script so the
 * failure path is exercised by the normal test run -- a guard whose
 * failing branch never executes is the defect class this repo keeps
 * producing (docs/BACKLOG.md sec 0.1, sec 0.0h).
 *
 * Three separate defects have shipped in this one config, each invisible
 * from the code because none of it lives in this repository:
 *
 * 1. the magic-link template showed a link and no `{{ .Token }}`, so an
 *    iOS user asked for a code never got one (2026-09-21);
 * 2. the same was true of the CONFIRMATION template -- the one a
 *    first-time address actually receives -- so every new signup was
 *    broken for days while returning users worked fine, and the first
 *    fix was "verified" from an account that already existed
 *    (2026-09-25);
 * 3. `site_url` was still `http://localhost:3000`, making the fallback
 *    link in every mail inert, and `mailer_otp_length` was 8 while the
 *    app asks for six digits (2026-09-26, found by reading a received
 *    email).
 *
 * 4. nothing guarded the OAuth redirect allowlist or the Google provider
 *    (2026-10-07): without the app's callback on the list, Google sign-in on
 *    iOS ends on the website instead of returning to the app.
 *
 * **These are necessary, not sufficient.** A template containing
 * `{{ .Token }}` does not prove a code arrives. Only receiving the mail
 * does (sec 0.0r).
 */
export type AuthConfig = {
  site_url?: string;
  mailer_otp_length?: number;
  mailer_templates_magic_link_content?: string;
  mailer_templates_confirmation_content?: string;
  mailer_subjects_magic_link?: string;
  mailer_subjects_confirmation?: string;
  /** Comma-separated, as the Management API returns it. */
  uri_allow_list?: string;
  external_google_enabled?: boolean;
};

/** AppConfig.googleSignInRedirectURL in the iOS app; pinned by a test that reads AppConfig.swift. */
export const IOS_OAUTH_CALLBACK = "com.obsidianmedia.learnwithalphonso://login-callback";

/**
 * A wildcard in the scheme, or in the host of a web URL, lets any site receive a sign-in redirect. A glob on the
 * app's own custom scheme (`com.example.app://**`) is not a catch-all: only that app registers the scheme.
 */
function isCatchAll(entry: string): boolean {
  if (/^\*{1,2}$/.test(entry)) return true;
  const m = /^([^:/]*):\/\/(.*)$/.exec(entry);
  if (!m) return entry.startsWith("*");
  const [, scheme, rest] = m;
  if (scheme.includes("*")) return true;
  if (!/^https?$/i.test(scheme)) return false;
  return rest.split("/")[0].startsWith("*");
}

/** An entry covers `url` when it is the same string, or a `<scheme>://...*` glob whose prefix `url` starts with. */
function allowlistCovers(entry: string, url: string): boolean {
  if (entry === url) return true;
  const glob = /^(.+?)\*{1,2}$/.exec(entry);
  return glob !== null && glob[1].includes("://") && url.startsWith(glob[1]);
}

function oauthProblems(cfg: AuthConfig): string[] {
  const problems: string[] = [];
  const entries = (cfg.uri_allow_list ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.some((entry) => allowlistCovers(entry, IOS_OAUTH_CALLBACK))) {
    problems.push(
      `uri_allow_list does not allow ${IOS_OAUTH_CALLBACK}: Google sign-in on iOS would end on the website instead of returning to the app`,
    );
  }
  for (const entry of entries.filter(isCatchAll)) {
    problems.push(
      `uri_allow_list contains the catch-all "${entry}": any site could receive a sign-in redirect`,
    );
  }
  if (cfg.external_google_enabled !== true) {
    problems.push(
      `external_google_enabled is ${cfg.external_google_enabled}: "Continue with Google" fails on iOS and the web`,
    );
  }
  return problems;
}

/**
 * The assertions, as a pure function so they can be unit-tested against
 * every broken shape that has actually shipped -- rather than only ever
 * being exercised against a production config that happens to be
 * correct. A guard whose failure path never runs is the defect class
 * this repo keeps producing.
 */
export function findAuthConfigProblems(cfg: AuthConfig): string[] {
  const problems: string[] = [];

  // Both templates, always. Fixing one and forgetting the other is the
  // exact bug that shipped, and "returning users can sign in" hides it.
  for (const key of [
    "mailer_templates_magic_link_content",
    "mailer_templates_confirmation_content",
  ] as const) {
    const body = cfg[key];
    if (!body) {
      problems.push(
        `${key} is empty -- Supabase will send its DEFAULT template, which has no code`,
      );
    } else if (!body.includes("{{ .Token }}")) {
      problems.push(`${key} does not render {{ .Token }} -- users get a link and no code`);
    }
  }

  // GoTrue builds {{ .ConfirmationURL }}'s redirect from site_url. A
  // localhost value makes the fallback link in every mail inert.
  if (!cfg.site_url) {
    problems.push("site_url is unset");
  } else if (/localhost|127\.0\.0\.1/.test(cfg.site_url)) {
    problems.push(`site_url is ${cfg.site_url} -- every confirmation link points at localhost`);
  } else if (!cfg.site_url.startsWith("https://")) {
    problems.push(`site_url is ${cfg.site_url} -- must be https`);
  }

  // The app's field is labelled "6-digit code" in two places
  // (AuthView.swift, HectorView.swift). Any other length tells every
  // user the wrong thing.
  if (cfg.mailer_otp_length !== 6) {
    problems.push(
      `mailer_otp_length is ${cfg.mailer_otp_length}, but the app asks for a 6-digit code`,
    );
  }

  problems.push(...oauthProblems(cfg));

  return problems;
}
