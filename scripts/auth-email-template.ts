/**
 * The body of the sign-in code email, kept apart from update-auth-email-template.ts (which patches production on
 * import) so a test can read it.
 *
 * Code only, no link. A "Prefer a link?" fallback built from the confirmation URL opened Safari on an iPhone and
 * signed the learner into the WEB app, and the link and the 6-digit code can share one token, so clicking the link
 * could spend the code the learner was about to type.
 *
 * One body for both Supabase templates (returning users get the magic-link one, first-time addresses the
 * confirmation one): the learner cannot tell which applies, so the mail must not differ.
 */
export const CODE_EMAIL =
  "<h2>Your sign-in code</h2>" +
  "<p>Enter this code in the app to sign in:</p>" +
  '<p style="font-size:32px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>' +
  "<p>This code expires shortly and can only be used once. If you didn't request this, you can safely ignore this email.</p>";
