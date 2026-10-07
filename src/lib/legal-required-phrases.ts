// src/lib/legal-required-phrases.ts
/**
 * Single source of truth for what each public legal page MUST and MUST NOT
 * say. Three guards read it:
 *   - src/routes/legal-content.test.tsx  (component, server-rendered markup)
 *   - e2e/legal-ssr.spec.ts              (raw HTML from a plain GET, no JS)
 *   - scripts/check-legal-live.ts        (production; run after deploy and before each App Store submission)
 *
 * Phrases are matched against htmlToText() output: body text only, with
 * <head>, <script> and <style> removed. That is deliberate. The page
 * <title> and TanStack's dehydration payload must never be able to satisfy
 * a "the page says X" check.
 *
 * Pick phrases that sit inside ONE text node (no <strong>/<a> inside them),
 * because tags become spaces.
 */
export type LegalPath = "/terms" | "/privacy" | "/cookies" | "/support";

export const SUPPORT_EMAIL = "support@alphonsoecosystem.app";

export const LEGAL_REQUIRED_PHRASES: Readonly<Record<LegalPath, readonly string[]>> = {
  "/terms": [
    "Terms of Use",
    "Shayan Salimi",
    SUPPORT_EMAIL,
    "You must be at least 13 years old to use the app.",
    "We have zero tolerance for objectionable content and abusive users.",
    "a … menu with Report and Block",
    "We review every report and act on it within 24 hours.",
    "Alphonso Pro is an optional, auto-renewing monthly subscription.",
    "Payment is charged to your Apple Account at confirmation of purchase.",
    "at least 24 hours before the end of the current period",
    "reportaproblem.apple.com",
    "Standard Licensed Application End User License Agreement",
    "Apple and Apple's subsidiaries are third-party beneficiaries of these terms",
    "Profile → Settings → Account",
    "Profile → Settings → AI features",
    "AI output can be wrong, incomplete or inappropriate",
    "governed by the laws of the Province of Ontario",
    "and, on leaderboards, the country you chose",
  ],
  "/privacy": [
    "Shayan Salimi",
    SUPPORT_EMAIL,
    "Supabase:",
    "Vercel:",
    "Resend:",
    "Deepgram:",
    "NVIDIA:",
    "RevenueCat:",
    "Apple Push Notification service",
    "Firebase Cloud Messaging",
    "We do not keep the conversation itself on our servers after Hector answers.",
    "we save practice items to your review queue",
    "asks what other learners should call you",
    "You can withdraw your consent at any time",
    "Profile → Settings → Account → Export My Data",
    "Profile → Settings → Account → Delete My Account",
    "same account and the same systems",
    "deleting your account removes your Hector data",
    "Deepgram does not keep your recordings or use them to train its models",
    "A friend pairing needs both friends to agree",
    "A matched learner sees only your display name",
    "If we pause matching, matched study buddies cannot send messages until it resumes",
    "Leaderboards also show the country you chose",
    "we keep it in your account record",
    "Skip gives you a generated name",
  ],
  "/cookies": [SUPPORT_EMAIL, "We do not set any optional cookies or storage today"],
  "/support": [
    SUPPORT_EMAIL,
    "within 24 hours",
    "Restore Purchases",
    "Profile → Settings → AI features",
    "removes your learning history, including Hector",
  ],
};

export const LEGAL_FORBIDDEN_PHRASES: Readonly<Record<LegalPath, readonly string[]>> = {
  "/terms": [
    "Terms of Service",
    "Keep your password secure",
    "You can delete your account at any time from Profile → Your data",
    "privacy@alphonsoecosystem.app",
    "keep the generated name",
  ],
  "/privacy": [
    "privacy@alphonsoecosystem.app",
    "is not retained on our servers after it answers",
    "Changing it from inside the iOS app is not available yet",
    "Terms of Service",
    "Amazon SES",
    "Amazon Web Services",
    "Only friends who both agree can pair",
  ],
  "/cookies": ["Product analytics", "privacy@alphonsoecosystem.app"],
  "/support": [
    "rather than a password",
    "These are separate accounts from an email sign-in",
    "privacy@alphonsoecosystem.app",
  ],
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1]?.toLowerCase() === "x";
      const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Visible body text of an HTML document or fragment, whitespace-collapsed. */
export function htmlToText(html: string): string {
  const withoutInvisible = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    // React's SSR stream separates adjacent text nodes with <!-- -->;
    // removing it without a space keeps "write to support@x.app." intact.
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutInvisible).replace(/\s+/g, " ").trim();
}
