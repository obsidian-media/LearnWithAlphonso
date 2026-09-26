import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, Bullets } from "../components/LegalPage";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Alphonso" },
      {
        name: "description",
        content:
          "How Alphonso collects, uses, stores and deletes your data, and how to exercise your GDPR rights.",
      },
      { property: "og:title", content: "Privacy Policy — Alphonso" },
      {
        property: "og:description",
        content: "What data Alphonso stores and how to delete or export it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CONTACT = "privacy@alphonsoecosystem.app";

function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="25 September 2026">
      <Section heading="Who we are">
        <p>
          Alphonso is an English learning app. This policy explains what we collect, why, and the
          choices you have. Questions? Write to {CONTACT}.
        </p>
      </Section>

      <Section heading="What we collect">
        <Bullets
          items={[
            "Account details: your email address, display name, optional country code and avatar seed.",
            "Learning data: lessons completed, quiz answers, XP, streaks, achievements, league standing and spaced-repetition review items.",
            "Conversation practice: the text of messages you exchange with the AI tutor, and audio you record while using speak-to-text. Audio is sent directly to our speech-to-text processor to produce a transcript and is not stored on our servers afterward.",
            "Technical data: basic request logs and error reports needed to keep the service running and secure.",
          ]}
        />
      </Section>

      <Section heading="Why we use it">
        <Bullets
          items={[
            "To provide the service: save your progress and sync it across your devices (contract).",
            "To operate leaderboards and leagues, which show your display name, country and XP to other signed-in learners (contract).",
            "To prevent abuse and control costs, including per-account daily limits on AI features (legitimate interests).",
            "To keep the app secure and diagnose faults (legitimate interests).",
          ]}
        />
        <p>We do not sell your data and we do not use it for advertising.</p>
      </Section>

      <Section heading="Who processes it">
        <p>
          Our hosting and database provider stores your account and learning data. AI features send
          data to named third-party processors, on our instructions, to generate a response:
        </p>
        <Bullets
          items={[
            "Deepgram converts your recorded speech to text (speech-to-text) and converts the AI tutor's written replies to spoken audio (text-to-speech). Recordings are sent directly to Deepgram for processing and are not stored on our servers.",
            "NVIDIA generates the AI tutor's conversation responses from the text you send it.",
          ]}
        />
      </Section>

      <Section heading="Hector (advanced voice tutor)">
        <p>
          If you use Hector, our advanced voice-conversation feature, you sign in to a second,
          separate account — entirely apart from the Alphonso account described elsewhere in this
          policy. Hector's account record and the voice conversations it processes are held on a
          separate backend, operated only for this feature.
        </p>
        <p>
          Deleting your main Alphonso account (see "Your rights" below) does <strong>not</strong>{" "}
          delete a Hector account or its data — they are on a different system and not currently
          linked for deletion. To delete a Hector account, write to {CONTACT} and we will action it
          manually.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          We keep your account data for as long as your account exists. When you delete your
          account, your data is removed immediately from our live systems and is purged from routine
          backups within 30 days. This does not include a separate Hector account — see "Hector
          (advanced voice tutor)" above.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          If you are in the UK, EEA or a region with similar law, you may access, correct, export,
          restrict or delete your data, object to processing, and complain to your local data
          protection authority.
        </p>
        <Bullets
          items={[
            "Export: on the web, Profile → Your data → Download my data; in the app, Settings → Export My Data. Both give you the same machine-readable JSON copy.",
            "Delete: on the web, Profile → Your data → Delete my account; in the app, Settings → Delete My Account (type DELETE to confirm). Both erase your account and all associated records permanently.",
            "Correct: change your display name and country any time from your profile.",
          ]}
        />
      </Section>

      <Section heading="Children">
        <p>
          Alphonso is not intended for children under 13 (or under 16 where local law requires). We
          do not knowingly create accounts for them.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We will update this page when our practices change and revise the date above. Significant
          changes will be highlighted in the app.
        </p>
      </Section>
    </LegalPage>
  );
}
