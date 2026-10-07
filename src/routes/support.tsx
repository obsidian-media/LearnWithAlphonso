import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, Bullets } from "../components/LegalPage";

/**
 * App Store Connect REQUIRES a Support URL and rejects a submission
 * without one. Before this route existed, `/support` was a 404 while
 * `/privacy`, `/terms` and `/cookies` all resolved -- so the one page
 * Apple insists on was the one missing (found 2026-09-26 while drafting
 * the submission metadata).
 *
 * Kept deliberately concrete: a reviewer opens this to confirm a real
 * human can be reached, and a user opens it when something is broken.
 * Both are served by a working address and honest answers to the
 * questions people actually arrive with -- not a marketing page.
 */
// support@ is a real, monitored mailbox (confirmed by the account owner
// 2026-09-26) -- which is the only reason it is used here. This is the
// one page App Store Connect requires and the address a reviewer is
// most likely to write to, so an alias nobody had created would be
// worse here than anywhere else.
const CONTACT = "support@alphonsoecosystem.app";

export const Route = createFileRoute("/support")({
  component: Support,
  head: () => ({
    meta: [
      { title: "Support — Alphonso" },
      {
        name: "description",
        content:
          "How to get help with Learn with Alphonso: contact details, account and subscription questions, and how to delete or export your data.",
      },
      { property: "og:title", content: "Support — Alphonso" },
      {
        property: "og:description",
        content: "Get help with Learn with Alphonso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Support() {
  return (
    <LegalPage title="Support" updated="7 October 2026">
      <Section heading="Contact us">
        <p>
          Write to {CONTACT} and a person will reply. Tell us what you were doing, what you
          expected, and what happened instead — and if it is about your account, write from the
          address you signed in with so we can find it.
        </p>
      </Section>

      <Section heading="Signing in">
        <Bullets
          items={[
            "In the iOS app, we email you a 6-digit code instead of using a password. Enter it in the app to sign in.",
            "No code? Check your spam folder, and make sure the address matches the one you signed up with.",
            "You can also sign in with Apple in the iOS app, or with Google. If your progress seems to be missing, sign in the same way you did the first time, or write to us.",
            "On the website you can also sign in with your email address and a password. Use “Forgot your password?” on the sign-in page to reset it.",
          ]}
        />
      </Section>

      <Section heading="Subscriptions">
        <Bullets
          items={[
            "Alphonso Pro is an auto-renewable monthly subscription that unlocks Hector, the AI voice tutor. Everything else is free.",
            "If you start with a free trial, you are charged when it ends unless you cancel at least 24 hours before.",
            "Manage or cancel it in the Settings app on your iPhone: tap your name, then Subscriptions. Cancel at least 24 hours before the end of the current period to avoid the next charge. We cannot cancel it for you, because Apple handles billing.",
            "Refunds are handled by Apple at reportaproblem.apple.com.",
            "If you subscribed through Google Play on Android, manage or cancel it in Google Play under Payments & subscriptions. Refunds follow Google Play’s policies.",
            "Already subscribed on another device? Use Restore Purchases on the subscription screen.",
          ]}
        />
      </Section>

      <Section heading="Your data">
        <Bullets
          items={[
            "Export: Profile, then Settings, then Account, then Export My Data.",
            "Deletion: the same screen, Delete My Account. It is permanent and removes your learning history, including Hector's. Hector runs on the same account, not a separate one, so there is nothing extra to request.",
            "AI features: turn them on or off any time under Profile → Settings → AI features.",
          ]}
        />
        <p>
          What we collect and why is set out in full in our <a href="/privacy">Privacy Policy</a>.
        </p>
      </Section>

      <Section heading="Reporting someone">
        <p>
          In the iOS app, every screen that shows another person has a “…” menu with Block and
          Report. On the website, the same menu is on leagues, friends and study buddies. Blocking
          takes effect immediately. We review every report within 24 hours. To report something the
          menu does not cover, such as a team name on the website, or if something needs urgent
          attention, write to {CONTACT}.
        </p>
      </Section>
    </LegalPage>
  );
}
