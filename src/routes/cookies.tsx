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
    <LegalPage title="Cookie Policy" updated="5 September 2026">
      <Section heading="What this covers">
        <p>
          Alphonso stores small amounts of data on your device using cookies and browser storage.
          This page explains what each item does and how to change your choice.
        </p>
      </Section>

      <Section heading="Strictly necessary">
        <Bullets
          items={[
            "Sign-in session: keeps you logged in and syncs your progress to your account. Without it the app cannot work.",
            "Security: protects sign-in requests against abuse.",
            "Your cookie choice itself, so we do not ask again on every visit.",
          ]}
        />
        <p>These do not require consent and cannot be switched off.</p>
      </Section>

      <Section heading="Optional">
        <Bullets
          items={[
            "Product analytics: anonymous counts of which screens and lessons are used, so we can improve the course. Only set if you choose Accept all.",
          ]}
        />
        <p>We do not use advertising or cross-site tracking cookies.</p>
      </Section>

      <Section heading="Changing your mind">
        <p>
          Choose Essential only in the banner to refuse optional storage. To change your choice
          later, clear this site's data in your browser settings and the banner will appear again on
          your next visit. Blocking strictly necessary storage will sign you out.
        </p>
      </Section>

      <Section heading="More information">
        <p>
          How we handle the data behind these cookies is described in our Privacy Policy. Questions?
          Write to privacy@lingua.app.
        </p>
      </Section>
    </LegalPage>
  );
}
