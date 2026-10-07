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
          "How Learn with Alphonso collects, uses, stores and deletes your data, who processes it, how AI consent works, and how to exercise your rights.",
      },
      { property: "og:title", content: "Privacy Policy — Alphonso" },
      {
        property: "og:description",
        content: "What data Alphonso stores, who processes it, and how to delete or export it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SUPPORT = "support@alphonsoecosystem.app";
const OPERATOR = "Shayan Salimi";
const UPDATED = "7 October 2026"; // same date on all four legal pages

function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <Section heading="Who we are">
        <p>
          Learn with Alphonso is a language learning app for English, French and Spanish, operated
          by {OPERATOR} ("we", "us"). This policy explains what we collect, why, who else handles
          it, and the choices you have. It covers the iOS app, the Android app where it is
          available, and the website at learn.alphonsoecosystem.app.
        </p>
        <p>
          We are the data controller for everything described here. Write to {SUPPORT} about
          anything in this policy or for help using the app. A person reads every message.
        </p>
      </Section>

      <Section heading="What we collect">
        <Bullets
          items={[
            "Account details: your email address, how you sign in (email, Apple or Google), and your display name. If you sign in with Apple or Google, we receive the email address they share with us (with Apple this may be a private relay address) and, if they share it, your name. We use your first name only to suggest a display name. Apple shares your given name only the first time you sign in with Apple, so we keep it in your account record for that suggestion. We also store an optional two-letter country code, a randomly generated avatar colour, and your chosen theme.",
            "Learning data: lessons completed, quiz and placement answers, XP, streaks, hearts, achievements, league and season standing, team membership and your team’s weekly mission progress (how many lessons you add to it, and the XP it pays out), duel results, your spaced-repetition review items, a learning goal if you set one (the level and date you choose), and any words you choose to save (the word, the sentence you tapped it in, and the meaning and answer choices we generate for it).",
            "Conversation practice: the text of messages you exchange with Hector and in practice scenarios and campaigns, your written answers to translation questions, and audio you record while speaking. These are sent to our AI providers to produce a reply, a transcript or a grade, and are not kept on our servers afterwards. What we do keep from a conversation is described in the Hector section below.",
            "Practice items from your mistakes: after a conversation, our AI looks for mistakes you make often. If it finds one, we save a short practice item to your review queue (a label for the weak spot, a question, answer choices and an explanation) and a record of the type of mistake.",
            "Social data: your friends and friend requests, study buddy pairings and the preset messages you exchange, whether you are waiting for a matched study buddy and that you confirmed you are 13 or older to use matching, team membership and any team name you choose, duel invitations, learners you block, and reports you make or that are made about you.",
            "AI consent: whether you have allowed AI features on your account, and when.",
            "Audio library use: which episodes you play, how far through you are, and which you download for offline listening.",
            "Purchases: whether you hold an active Alphonso Pro subscription, and its status and renewal dates. We never receive or store your card details. Apple, or Google Play on Android, handles payment.",
            "Notifications: if you enable push notifications, a device token so we can send them. It is used for nothing else.",
            "Usage limits: counts of how many AI requests your account makes each day, so we can apply fair-use limits.",
            "Technical data: request logs and error reports needed to keep the service running and secure, including IP address, device or browser type, and the time and address of each request.",
          ]}
        />
      </Section>

      <Section heading="Choosing your display name">
        <p>
          When you first sign in, the app asks what other learners should call you. It suggests your
          first name if Apple or Google shared it with us, or otherwise a generated name like
          Learner-4F2A. Apple shares your given name only once, when you first sign in with Apple,
          so we keep it in your account record to make that suggestion. You can type a different
          name, or tap Skip. Skip gives you a generated name like Learner-4F2A, replacing any name
          that came from your Google account, and you can change it later. Your display name is
          visible to other learners, so you do not have to use your real name, and you should never
          include contact details in it.
        </p>
        <p>
          Every name is checked against a filter for offensive words. If you signed up before this
          step existed and your display name was taken from your email address or did not pass the
          filter, we replaced it with a generated name, and the app asks you once to choose your
          own.
        </p>
      </Section>

      <Section heading="AI features and your consent">
        <p>
          AI features (Hector, practice scenarios and campaigns, AI grading of written translations,
          speech transcription, spoken replies, word meanings and practice items from your mistakes)
          only run after you allow them. The first time you open one, the app explains what is sent
          and to whom, and asks for your permission. Your choice is saved on your account with the
          time you made it, so it applies on every device you sign in on.
        </p>
        <p>
          You can withdraw your consent at any time, in the iOS app under Profile → Settings → AI
          features, or on the website on your Profile page. From that moment nothing more is sent to
          our AI providers. Without consent you can still do lessons, review and the placement test:
          written answers are checked against the expected answers instead of by AI, and speaking
          questions let you type your answer. Withdrawing consent does not delete what was already
          saved, such as practice items in your review queue. Deleting your account deletes them. If
          our safety filter blocks part of an AI reply, a short excerpt of it (up to 120 characters)
          is written to our server request logs so we can check the filter.
        </p>
        <p>
          Some extra practice questions are generated from the lesson itself. Those requests contain
          only the lesson and the course, and nothing about you, so they do not need your consent.
        </p>
      </Section>

      <Section heading="Why we use it, and our legal basis">
        <Bullets
          items={[
            "To provide the service: saving your progress and syncing it across devices (performance of our contract with you).",
            "To operate leaderboards, leagues, friends, teams, duels and study buddies, which show your display name, avatar colour and progress to other signed-in learners, and on leaderboards the country you chose (performance of our contract).",
            "To run AI features: generating replies, transcribing your speech, grading written answers, writing word meanings and creating practice items from your mistakes (your consent, which you can withdraw at any time).",
            "To manage your subscription and unlock Alphonso Pro (performance of our contract).",
            "To send sign-in codes, password-reset links and other account emails (performance of our contract).",
            "To send push notifications you have enabled (your consent, which you can withdraw in your device settings at any time).",
            "To review reports, enforce our Terms of Use and keep learners safe (our legitimate interests and our legal obligations).",
            "To prevent abuse and control cost, including per-account daily limits on AI features (our legitimate interests).",
            "To keep the app secure and diagnose faults (our legitimate interests).",
          ]}
        />
        <p>
          We do not sell your data, we do not share it with data brokers, and we do not use it for
          advertising. There are no advertising, analytics or crash-reporting SDKs in our apps.
        </p>
      </Section>

      <Section heading="What other people can see">
        <p>
          Leaderboards, leagues, friends, teams, duels and study buddies show your display name,
          avatar colour and progress (such as XP and lesson counts) to other signed-in learners.
          Leaderboards also show the country you chose, if you set one. Other learners cannot read
          the rest of your profile.
        </p>
        <p>
          A team's weekly mission shows every member the team's total progress and your own count of
          lessons. The mission does not list other members' individual counts. On a two-member team,
          while the mission is in progress, the total and your count reveal the other member's
          count.
        </p>
        <p>
          If you pair with a friend as study buddies, each of you can see the other's weekly lesson
          counts and your shared streak while you are paired, and those weekly counts are kept as
          your pair's history after it ends. A friend pairing needs both friends to agree, and
          either of you can end it at any time. Study buddies can send each other short fixed
          messages from a list (like "Nice work!"). There is no free text, and the messages are kept
          as your pair's history. If you want a study buddy who is not a friend, you can choose to
          be matched with another learner of the same course at a similar level (you confirm you are
          13 or older first). A matched learner sees only your display name, your avatar, your
          weekly lesson counts, your shared streak, the preset messages you send, and that you study
          the same course at a similar level. You can end the pairing, block or report them at any
          time, and you can stop looking for a match whenever you like. If we pause matching,
          matched study buddies cannot send messages until it resumes. Friend pairings are not
          affected.
        </p>
        <p>
          You can change your display name in the iOS app under Profile → Settings, or on the
          website on your Profile page. Everything else, including your email address, your answers,
          your recordings and your conversations, is never shown to other users.
        </p>
      </Section>

      <Section heading="Who processes it">
        <p>
          We use the following processors. Each acts on our instructions and only for the purpose
          listed.
        </p>
        <Bullets
          items={[
            "Supabase: database, authentication and server functions. Holds your account and all learning data.",
            "Vercel: hosts the website and the server API that the apps call. It handles every request the apps and the website make, and keeps request logs (including IP address and device or browser type) for a limited period so we can keep the service secure and working.",
            "Resend: delivers the emails we send, such as your sign-in codes and password-reset links, and internal alerts to us when a learner files a report.",
            "Deepgram: converts your recorded speech to text, and AI replies to spoken audio. It receives the recording or the reply text, not your account details. Deepgram does not keep your recordings or use them to train its models: we opt every request out of its model improvement program, so it keeps the data only as long as it needs to process the request.",
            "NVIDIA: generates AI replies for Hector and the practice scenarios, grades written translation answers, writes the meaning and answer choices when you save a word, and finds practice items in your conversation mistakes. It receives only the text needed for each task.",
            "RevenueCat: manages subscription status. It receives an account identifier and purchase and renewal information from Apple or Google, not your payment details.",
            "Apple: Sign in with Apple if you choose it, App Store billing for Alphonso Pro, and the Apple Push Notification service for notifications on iPhone.",
            "Google: Sign in with Google if you choose it and, on Android, Google Play billing and Firebase Cloud Messaging for notifications.",
          ]}
        />
      </Section>

      <Section heading="Where your data goes">
        <p>
          Several of these processors are based in the United States, and some may process data in
          other countries. Where your data is transferred outside your own country, we rely on the
          transfer safeguards those providers make available, such as standard contractual clauses.
        </p>
      </Section>

      <Section heading="Hector (advanced voice tutor)">
        <p>
          Hector, our advanced AI voice tutor, runs on the same account and the same systems as the
          rest of Learn with Alphonso. There is no separate sign-in and no separate account. Your
          spoken audio is transcribed by Deepgram and Hector's replies are generated by NVIDIA, as
          described above.
        </p>
        <p>
          We do not keep the conversation itself on our servers after Hector answers. When a
          conversation ends, the app sends it to NVIDIA once more to look for mistakes you make
          often. If it finds any, we save practice items to your review queue and a record of the
          type of mistake. That is how Hector remembers your weak spots between sessions. The same
          happens after practice scenarios and campaigns.
        </p>
        <p>
          Because Hector is part of your one account, deleting your account removes your Hector data
          along with everything else. There is nothing separate to manage.
        </p>
      </Section>

      <Section heading="Automated processing">
        <p>
          The app grades answers automatically, uses AI to find practice items in your conversation
          mistakes (only if you have allowed AI features), and uses your answer history to decide
          which items to review and when. A placement test estimates your starting level. These
          affect what the app shows you and nothing else. They have no legal or similarly
          significant effect on you, and a human is not involved. You can retake the placement test
          at any time.
        </p>
      </Section>

      <Section heading="Reports and blocking">
        <p>
          When you report a learner, a team name or an AI reply, we store the report with the reason
          you chose and who or what it is about. For an AI reply, we also store the text of that
          reply and where it appeared. We are alerted by email and review every report within 24
          hours. The learner you report is not told who reported them. When you block someone, we
          store the block so that it works on every device.
        </p>
        <p>
          Reports, and the actions we take on them, are kept for as long as the accounts involved
          exist, so we can deal with repeated abuse. Deleting your account deletes the reports you
          made and the blocks you set.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          We keep your account data for as long as your account exists. When you delete your
          account, your data is removed immediately from our live systems and is purged from routine
          backups within 30 days. Request logs held by Vercel are kept only for the limited period
          its service retains them.
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
          If you are in the UK, the EEA or a region with similar law, you may access, correct,
          export, restrict or delete your data, object to processing, and withdraw consent where we
          rely on it.
        </p>
        <Bullets
          items={[
            "Export: on the web, Profile → Your data → Download my data; in the app, Profile → Settings → Account → Export My Data. Both give you the same machine-readable JSON copy.",
            "Delete: on the web, Profile → Your data → Delete my account; in the app, Profile → Settings → Account → Delete My Account (type DELETE to confirm). Both erase your account and all associated records permanently.",
            "Correct: change your display name in the iOS app under Profile → Settings, or your display name and country on the website on your Profile page, or write to us and we will change them for you.",
            "Withdraw consent: turn off AI features in the iOS app or on the website as described above, and turn off notifications in your device settings.",
            "Anything else: write to " + SUPPORT + " and we will respond within one month.",
          ]}
        />
        <p>
          You also have the right to complain to your local data protection authority. In the UK
          that is the Information Commissioner's Office.
        </p>
        <p>
          If you signed in to the iOS app with Apple, deleting your account also revokes that Sign
          in with Apple connection automatically. If that step ever fails on our end, you can revoke
          it yourself at any time, on your device under Settings → [your name] → Sign-In &amp;
          Security → Apps Using Apple ID, or at{" "}
          <a href="https://appleid.apple.com">appleid.apple.com</a>.
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
          Learn with Alphonso is not intended for children under 13, or under the higher age that
          applies where local law requires one. We do not knowingly create accounts for them, and
          study buddy matching asks you to confirm you are 13 or older. The app is rated 13+ on the
          App Store.
        </p>
        <p>
          If you believe a child has created an account, write to {SUPPORT} and we will delete it.
        </p>
      </Section>

      <Section heading="Cookies and local storage">
        <p>
          The website stores a small number of items in your browser, all listed in our{" "}
          <a href="/cookies">Cookie Policy</a>. The apps do not use cookies. They store your sign-in
          session on the device so you stay signed in.
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
