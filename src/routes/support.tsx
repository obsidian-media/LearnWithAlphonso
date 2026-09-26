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
// Deliberately the SAME address the legal pages already use, not an
// invented support@ alias. A mailbox nobody has created is worse here
// than anywhere else: this is the one page App Store Connect requires,
// and a reviewer may well write to it. Switch to a dedicated address
// only once that mailbox is confirmed to exist and is monitored.
const CONTACT = "privacy@alphonsoecosystem.app";

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
    <LegalPage title="Support" updated="26 September 2026">
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
            "We email you a 6-digit code rather than a password. Enter it in the app to sign in.",
            "No code? Check spam, and make sure the address matches the one you signed up with — a different address creates a different account.",
            "You can also sign in with Apple or Google. These are separate accounts from an email sign-in, even when the address looks the same.",
          ]}
        />
      </Section>

      <Section heading="Subscriptions">
        <Bullets
          items={[
            "Alphonso Pro is an auto-renewable subscription that unlocks Hector, the AI tutor. Everything else is free.",
            "Manage or cancel it in the Settings app on your device, under your name, then Subscriptions. We cannot cancel it for you — Apple handles billing.",
            "Already subscribed on another device? Use Restore Purchases on the paywall screen.",
          ]}
        />
      </Section>

      <Section heading="Your data">
        <Bullets
          items={[
            "Export: Profile, then Settings, then Account, then Export My Data.",
            "Deletion: the same screen, Delete My Account. It is permanent and removes your learning history.",
            "Hector uses a separate account on a different system and is not currently linked for deletion. To delete a Hector account, write to " +
              CONTACT +
              " and we will action it manually.",
          ]}
        />
        <p>
          What we collect and why is set out in full in our <a href="/privacy">Privacy Policy</a>.
        </p>
      </Section>

      <Section heading="Reporting someone">
        <p>
          Every screen that shows another person has a “…” menu with Block and Report. Blocking
          takes effect immediately. Reports are reviewed, and you can also write to {CONTACT} if
          something needs urgent attention.
        </p>
      </Section>
    </LegalPage>
  );
}
