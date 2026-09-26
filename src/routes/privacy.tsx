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
          "How Alphonso collects, uses, stores and deletes your data, who processes it, and how to exercise your rights.",
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
const SUPPORT = "support@alphonsoecosystem.app";

function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="26 September 2026">
      <Section heading="Who we are">
        <p>
          Learn with Alphonso is a language learning app for English, French and Spanish. This
          policy explains what we collect, why, who else sees it, and the choices you have. It
          covers both the iOS app and the website.
        </p>
        <p>
          We are the data controller for everything described here. Write to {CONTACT} about
          anything in this policy, or {SUPPORT} for help using the app.
        </p>
      </Section>

      <Section heading="What we collect">
        <Bullets
          items={[
            "Account details: your email address and a display name. If you sign in with Google or Apple, we receive the name and email address that provider gives us — with Google this is usually your real name, and with Apple it may be a private relay address. We also store an optional two-letter country code, a randomly generated avatar seed, and your chosen theme.",
            "Learning data: lessons completed, quiz and placement answers, XP, streaks, hearts, achievements, league and season standing, team membership, duel results, and your spaced-repetition review items.",
            "Conversation practice: the text of messages you exchange with the AI tutor, your written answers to translation questions, and audio you record while speaking. Audio is sent to our speech-to-text processor to produce a transcript and is not stored on our servers afterwards.",
            "Audio library use: which episodes you play, how far through you are, and which you download for offline listening.",
            "Purchases: whether you hold an active subscription, and its status and renewal dates. We never receive or store your card details — Apple handles payment.",
            "Notifications: if you enable push notifications, a device token so we can send them. It is used for nothing else.",
            "Technical data: request logs and error reports needed to keep the service running and secure.",
          ]}
        />
      </Section>

      <Section heading="Why we use it, and our legal basis">
        <Bullets
          items={[
            "To provide the service — saving your progress and syncing it across devices (performance of our contract with you).",
            "To operate leaderboards, leagues, teams and duels, which show your display name, country and XP to other signed-in learners (performance of our contract).",
            "To generate AI responses, transcribe your speech and grade written answers (performance of our contract).",
            "To manage your subscription and unlock paid features (performance of our contract).",
            "To send push notifications you have enabled (your consent, which you can withdraw in your device settings at any time).",
            "To prevent abuse and control cost, including per-account daily limits on AI features (our legitimate interests).",
            "To keep the app secure and diagnose faults (our legitimate interests).",
          ]}
        />
        <p>
          We do not sell your data, we do not share it with data brokers, and we do not use it for
          advertising. There are no advertising, analytics or crash-reporting SDKs in this app.
        </p>
      </Section>

      <Section heading="What other people can see">
        <p>
          Leaderboards, leagues, teams, duels and friend lists show your{" "}
          <strong>display name</strong>, country and XP to other signed-in learners. If you signed
          in with Google, your display name starts out as the name Google gave us, which is usually
          your real name.
        </p>
        <p>
          You can change your display name on the website under Profile. Changing it from inside the
          iOS app is not available yet; until it is, you can change it on the website or write to{" "}
          {CONTACT} and we will change it for you. Everything else — your email address, your
          answers, your recordings and your conversations — is never shown to other users.
        </p>
      </Section>

      <Section heading="Who processes it">
        <p>
          We use the following processors, each acting on our instructions and only for the purpose
          listed:
        </p>
        <Bullets
          items={[
            "Supabase — hosting, database and authentication. Holds your account and all learning data.",
            "Deepgram — converts your recorded speech to text, and the AI tutor's replies to spoken audio. Recordings are sent for processing and are not stored on our servers.",
            "NVIDIA — generates the conversation tutor's responses and grades written translation answers, from the text you send.",
            "Cloud Voice (voice.obsidianmedia.online) — runs the Hector voice tutor, including its chat text and audio. See the Hector section below.",
            "RevenueCat — manages subscription status. Receives an account identifier and purchase state, not payment details.",
            "Apple and Google — only if you choose to sign in with them, and only to confirm your identity.",
          ]}
        />
      </Section>

      <Section heading="Where your data goes">
        <p>
          Some of these processors are based outside the UK and the EEA, including in the United
          States. Where your data is transferred outside your own country, we rely on the transfer
          safeguards those providers make available, such as standard contractual clauses.
        </p>
      </Section>

      <Section heading="Hector (advanced voice tutor)">
        <p>
          If you use Hector, you sign in to a second, separate account — entirely apart from the
          Alphonso account described elsewhere in this policy. Hector's account record, its chat
          text and the voice conversations it processes are held on a separate backend operated only
          for this feature. Hector's chat does not go to NVIDIA; its audio is transcribed by
          Deepgram in the same way as the rest of the app.
        </p>
        <p>
          Deleting your main Alphonso account does <strong>not</strong> delete a Hector account or
          its data — they are on a different system and not currently linked for deletion. To delete
          a Hector account, write to {CONTACT} and we will action it manually.
        </p>
      </Section>

      <Section heading="Automated processing">
        <p>
          The app grades some written answers automatically and uses your answer history to decide
          which items to review and when. A placement test estimates your starting level. These
          affect what the app shows you and nothing else — they have no legal or similarly
          significant effect on you, and a human is not involved. You can retake the placement test
          at any time.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          We keep your account data for as long as your account exists. When you delete your
          account, your data is removed immediately from our live systems and is purged from routine
          backups within 30 days. This does not include a separate Hector account — see the Hector
          section above.
        </p>
      </Section>

      <Section heading="How we protect it">
        <p>
          Data is encrypted in transit. Access to the database is restricted by row-level security
          so that one account cannot read another's records, and administrative access is limited to
          the people who need it. No system is perfectly secure, but we design on the basis that a
          leaked client key must not be enough to reach anyone else's data.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          If you are in the UK, EEA or a region with similar law, you may access, correct, export,
          restrict or delete your data, object to processing, and withdraw consent where we rely on
          it.
        </p>
        <Bullets
          items={[
            "Export: on the web, Profile → Your data → Download my data; in the app, Profile → Settings → Account → Export My Data. Both give you the same machine-readable JSON copy.",
            "Delete: on the web, Profile → Your data → Delete my account; in the app, Profile → Settings → Account → Delete My Account (type DELETE to confirm). Both erase your account and all associated records permanently.",
            "Correct: change your display name and country from your profile on the website, or write to us and we will change them for you.",
            "Anything else: write to " + CONTACT + " and we will respond within one month.",
          ]}
        />
        <p>
          You also have the right to complain to your local data protection authority. In the UK
          that is the Information Commissioner's Office.
        </p>
      </Section>

      <Section heading="If you are in California">
        <p>
          We do not sell your personal information and we do not share it for cross-context
          behavioural advertising, so there is nothing to opt out of. You have the right to know
          what we collect, to request a copy, to request deletion, and not to be discriminated
          against for exercising those rights. The export and deletion tools above are open to
          everyone, wherever you live.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          Learn with Alphonso is not intended for children under 13, or under 16 where local law
          requires a higher age. We do not knowingly create accounts for them. The app is rated
          accordingly on the App Store.
        </p>
        <p>
          If you believe a child has created an account, write to {CONTACT} and we will delete it.
        </p>
      </Section>

      <Section heading="Cookies and local storage">
        <p>
          The website uses a small number of cookies and browser storage items, all listed in our{" "}
          <a href="/cookies">Cookie Policy</a>. The iOS app does not use cookies; it stores your
          sign-in session on the device so you stay signed in.
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
