import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, Bullets } from "../components/LegalPage";

export const Route = createFileRoute("/cookies")({
  component: Cookies,
  head: () => ({
    meta: [
      { title: "Cookie Policy — Alphonso" },
      {
        name: "description",
        content:
          "Which cookies and local storage Alphonso uses, what each is for, and how to change your choice.",
      },
      { property: "og:title", content: "Cookie Policy — Alphonso" },
      {
        property: "og:description",
        content: "Cookies and storage used by Alphonso, and how to control them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Cookies() {
  return (
    <LegalPage title="Cookie Policy" updated="7 October 2026">
      <Section heading="What this covers">
        <p>
          The Learn with Alphonso website stores a few small items in your browser, in cookies or
          in browser storage. This page lists each one, what it is for, and how to change your
          choice. The iOS and Android apps do not use cookies.
        </p>
      </Section>

      <Section heading="Strictly necessary">
        <Bullets
          items={[
            "Sign-in session: kept in your browser’s local storage so you stay signed in and your progress syncs to your account. Without it the website cannot work.",
            "Sign-in security: a short-lived value used while you sign in with Google, to protect the sign-in from tampering.",
            "Your cookie choice, so we do not ask again on every visit.",
          ]}
        />
      </Section>

      <Section heading="Preferences">
        <Bullets
          items={[
            "Your theme, so the website looks the way you chose before it finishes loading.",
            "Small reminders, such as how many times we have shown you the save-a-word hint, and a copy of your learning goal so it appears quickly.",
          ]}
        />
        <p>These make the website work the way you set it up and do not require consent.</p>
      </Section>

      <Section heading="Optional">
        <p>
          We do not set any optional cookies or storage today: no analytics, no advertising and no
          cross-site tracking. If we ever add optional analytics, we will list it here first and
          only use it if you choose Accept all in the banner.
        </p>
      </Section>

      <Section heading="Changing your mind">
        <p>
          To change your choice later, clear this site's data in your browser settings, and the
          banner will appear again on your next visit. Clearing or blocking strictly necessary
          storage signs you out.
        </p>
      </Section>

      <Section heading="More information">
        <p>
          How we handle your data is described in our <a href="/privacy">Privacy Policy</a>.
          Questions? Write to support@alphonsoecosystem.app.
        </p>
      </Section>
    </LegalPage>
  );
}
