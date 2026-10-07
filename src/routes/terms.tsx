import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, Bullets } from "../components/LegalPage";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: () => ({
    meta: [
      { title: "Terms of Use — Alphonso" },
      {
        name: "description",
        content:
          "The terms for using Learn with Alphonso: accounts, community rules, AI features, the Alphonso Pro subscription, and Apple's App Store terms.",
      },
      { property: "og:title", content: "Terms of Use — Alphonso" },
      { property: "og:description", content: "The agreement between you and Learn with Alphonso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CONTACT = "support@alphonsoecosystem.app";
const OPERATOR = "Shayan Salimi";
const STANDARD_EULA = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const UPDATED = "7 October 2026"; // same on all four legal pages

function Terms() {
  return (
    <LegalPage title="Terms of Use" updated={UPDATED}>
      <Section heading="About these terms">
        <p>
          These Terms of Use are an agreement between you and {OPERATOR}, who operates Learn with
          Alphonso ("Alphonso", "we", "us"). They cover the Learn with Alphonso app for iPhone, the
          Android app where it is available, the website at learn.alphonsoecosystem.app, and the
          services behind them (together, "the app").
        </p>
        <p>
          By creating an account or using the app you agree to these terms and to our{" "}
          <a href="/privacy">Privacy Policy</a>, which explains how we handle your data. If you do
          not agree, do not use the app.
        </p>
        <p>
          If you downloaded the app from Apple's App Store, these terms supplement Apple's Standard
          Licensed Application End User License Agreement (the "Standard EULA", at{" "}
          <a href={STANDARD_EULA}>{STANDARD_EULA}</a>). Your licence to use the iOS app comes from
          the Standard EULA, and these terms add the rules that are specific to Alphonso. Where the
          two conflict about the iOS app, the Standard EULA wins. If you downloaded the app from
          Google Play, Google Play's terms also apply to your download and to any purchase you make
          there.
        </p>
      </Section>

      <Section heading="Who can use Alphonso">
        <Bullets
          items={[
            "You must be at least 13 years old to use the app. Where the law where you live sets a higher minimum age for using online services without a parent’s consent, you must be at least that age.",
            "If you are under 18, please read these terms with a parent or guardian.",
            "You must not use the app if the law where you live forbids it, or if we have previously closed your account for breaking these terms.",
          ]}
        />
      </Section>

      <Section heading="Your account">
        <Bullets
          items={[
            "You can sign in with Apple (in the iOS app), with Google, or with your email address. In the iOS app, email sign-in works with a one-time 6-digit code that we email to you, and there is no password. On the website, you can also sign in with your email address and a password.",
            "Keep access to your email account and to your Apple or Google account secure. You are responsible for what happens in your Alphonso account. Tell us at " +
              CONTACT +
              " if you think someone else has used it.",
            "One person, one account. Accounts are personal and cannot be sold or transferred.",
          ]}
        />
      </Section>

      <Section heading="Your display name">
        <p>
          Other learners see the display name on your account. When you first sign in, the app asks
          what other learners should call you. It suggests your first name if Apple or Google shared
          it with us, or otherwise a generated name like Learner-4F2A. You can choose something
          else, or skip to get a generated name. You can change it later in the iOS app under
          Profile → Settings, or on the website on your Profile page.
        </p>
        <p>
          Your display name must not be sexual, hateful, threatening or otherwise offensive, must
          not impersonate anyone, and must not contain contact details or links. Names that break
          this rule are refused when you choose them, and we reset any that get through.
        </p>
      </Section>

      <Section heading="Community rules">
        <p>
          Alphonso has leaderboards, leagues, friends, teams, duels and study buddies, so other
          learners can see your display name, your avatar colour, your progress, any team name you
          choose and, on leaderboards, the country you chose. We have zero tolerance for
          objectionable content and abusive users.
        </p>
        <p>You must not:</p>
        <Bullets
          items={[
            "harass, bully, threaten, stalk or intimidate anyone;",
            "use a display name or team name that is sexual, hateful, discriminatory, violent, obscene or otherwise objectionable;",
            "impersonate another person, Alphonso or Apple;",
            "share someone else’s personal information, or try to get personal information from another learner;",
            "use a name or team name to try to contact or meet a learner outside the app;",
            "cheat, including by manipulating XP, streaks, leagues, duels or team missions with automated tools, multiple accounts or other unfair means;",
            "use the app for anything unlawful.",
          ]}
        />
        <p>
          In the iOS app, every screen that shows another learner (leaderboards, friends, teams,
          duels and study buddies) has a … menu with Report and Block. On the website, the same menu
          is on leagues, friends and study buddies. Blocking takes effect immediately. You can also
          report a problem, including a team name, by writing to {CONTACT}.
        </p>
        <p>
          We review every report and act on it within 24 hours. When content or a learner breaks
          these rules, we remove the content (for example, by resetting a display name, or by
          renaming or disbanding a team) and we warn, suspend or permanently remove the account
          responsible. Serious or repeated breaches lead to permanent removal without warning.
        </p>
      </Section>

      <Section heading="AI features">
        <p>
          Some features use artificial intelligence: conversations with Hector, the practice
          scenarios and campaigns, grading of written translation answers, transcription of your
          speech, spoken replies, word meanings when you save a word, and practice items made from
          mistakes in your conversations. They send what you say or write to our AI providers,
          NVIDIA (text) and Deepgram (speech), as our Privacy Policy explains. They only work after
          you allow them on your account, and you can turn them off at any time in the iOS app under
          Profile → Settings → AI features, or on the website on your Profile page. Lessons, review
          and the placement test work without them.
        </p>
        <Bullets
          items={[
            "AI output can be wrong, incomplete or inappropriate, even though we instruct our AI models to stay on language learning and to keep content suitable for teenagers. Treat it as practice, not as professional, certified or authoritative instruction.",
            "Do not use the AI features to create content that is sexual, hateful, violent, harassing or unlawful, and do not try to get around their safety rules.",
            "If an AI reply is inappropriate, press and hold it in the iOS app and choose Report, or write to " +
              CONTACT +
              ". We review these reports like any other.",
            "Do not rely on AI features for medical, legal, financial or safety decisions. If you are in danger or in crisis, contact your local emergency services.",
            "Daily fair-use limits apply to AI features on each account.",
          ]}
        />
      </Section>

      <Section heading="Alphonso Pro subscription">
        <p>
          Alphonso Pro is an optional, auto-renewing monthly subscription. It unlocks Hector, the AI
          voice tutor. Everything else in the app is free.
        </p>
        <Bullets
          items={[
            "Price: the price and billing period are shown in the app, in your local currency, before you confirm the purchase.",
            "Free trial: if a free trial is offered and you are eligible, the app shows it before you confirm. When the trial ends, your paid subscription starts automatically unless you cancel at least 24 hours before the trial ends. Apple or Google decides who is eligible for a trial.",
            "Billing: Payment is charged to your Apple Account at confirmation of purchase. If you subscribe through Google Play on Android, payment is charged to your Google Play account. We never receive your card details.",
            "Renewal: your subscription renews automatically for another month unless you cancel it at least 24 hours before the end of the current period. Your account is charged for the renewal within the 24 hours before the current period ends.",
            "Cancelling: manage or cancel your subscription in your Apple Account settings (on iPhone: Settings → your name → Subscriptions), or on Android in Google Play → Payments & subscriptions. Cancelling stops the next renewal, and you keep Pro until the end of the period you have paid for. Deleting your Alphonso account does not cancel your subscription.",
            "Refunds: App Store purchases are handled by Apple under Apple’s refund policies. You can ask Apple for a refund at reportaproblem.apple.com. Google Play purchases are handled under Google Play’s refund policies. We cannot refund store purchases ourselves.",
            "Restoring: if you reinstall the app or move to a new device, tap Restore Purchases on the subscription screen.",
            "Price changes: if the price of Pro changes, Apple or Google tells you before it applies to you, and asks for your agreement where their rules or the law require it.",
          ]}
        />
      </Section>

      <Section heading="XP, hearts and other in-app items">
        <p>
          XP, hearts, streaks, streak freezes, league positions, badges and other in-app items have
          no monetary value. They cannot be bought with money, sold, transferred or exchanged for
          cash, and we may change how they work to keep the app fair.
        </p>
      </Section>

      <Section heading="Our content and your content">
        <Bullets
          items={[
            "The lessons, questions, audio, images, the Alphonso and Hector characters, the app’s design and its code belong to us or our licensors. We give you a personal, non-exclusive, non-transferable right to use them in the app for your own learning, and not for any commercial purpose.",
            "Do not copy, scrape, resell or redistribute lesson content, try to get around usage limits, or reverse engineer the app, except where the law allows it.",
            "What you write or say in the app stays yours. You give us a worldwide, royalty-free licence to store, process and display it only as needed to run the app for you, for example to show your display name to other learners or to turn your speech into text. The licence ends when you delete the content or your account, except for anything we must keep to comply with the law or to deal with a report.",
          ]}
        />
      </Section>

      <Section heading="Apple App Store terms">
        <p>
          If you use the iOS app, these points also apply. In them, "Apple" means Apple Inc. and its
          subsidiaries.
        </p>
        <Bullets
          items={[
            "Acknowledgement: these terms are between you and " +
              OPERATOR +
              " only, not Apple. " +
              OPERATOR +
              ", not Apple, is solely responsible for the iOS app and its content.",
            "Scope of licence: your licence to use the iOS app is a non-transferable licence to use it on any Apple-branded products that you own or control, as permitted by the Usage Rules in the Apple Media Services Terms and Conditions, except that the app may be accessed and used by other accounts associated with you through Family Sharing or volume purchasing.",
            "Maintenance and support: we are solely responsible for providing maintenance and support for the iOS app, as described in these terms and on our Support page. Apple has no obligation at all to provide any maintenance or support for the app.",
            "Warranty: we are solely responsible for any product warranties, whether express or implied by law, to the extent they are not effectively disclaimed. If the iOS app fails to conform to any applicable warranty, you may notify Apple, and Apple will refund the purchase price, if any, of the app to you. To the maximum extent permitted by law, Apple has no other warranty obligation for the app, and any other claims, losses, liabilities, damages, costs or expenses caused by a failure to conform to a warranty are our responsibility.",
            "Product claims: we, not Apple, are responsible for addressing any claims from you or any third party about the iOS app or your possession and use of it, including product liability claims, any claim that the app fails to conform to an applicable legal or regulatory requirement, and claims under consumer protection, privacy or similar laws.",
            "Intellectual property: if a third party claims that the iOS app, or your possession and use of it, infringes their intellectual property rights, we, not Apple, are solely responsible for investigating, defending, settling and discharging that claim.",
            "Legal compliance: you confirm that you are not located in a country that is subject to a U.S. Government embargo or that the U.S. Government has designated as a “terrorist supporting” country, and that you are not listed on any U.S. Government list of prohibited or restricted parties.",
            "Developer contact: questions, complaints or claims about the iOS app go to " +
              OPERATOR +
              " at " +
              CONTACT +
              ".",
            "Third-party terms: when you use the app you must also comply with any third-party terms that apply to you, such as your mobile carrier’s or internet provider’s terms.",
            "Third-party beneficiary: Apple and Apple's subsidiaries are third-party beneficiaries of these terms as they apply to the iOS app. Once you accept these terms, Apple has the right (and is deemed to have accepted the right) to enforce them against you as a third-party beneficiary.",
          ]}
        />
      </Section>

      <Section heading="Your data">
        <p>
          Our Privacy Policy explains what we collect and why. You can download a copy of your data
          or delete your account at any time: in the iOS app under Profile → Settings → Account
          (Export My Data, Delete My Account), or on the website under Profile → Your data. Deleting
          your account is permanent.
        </p>
      </Section>

      <Section heading="Ending your account">
        <Bullets
          items={[
            "You can stop using the app and delete your account at any time, as described above.",
            "We may suspend or close your account if you break these terms, if the law requires it, or if your use puts other learners or the app at risk. Where it is reasonable and safe, we tell you why and give you a chance to respond.",
            "We may change or stop offering parts of the app. If we close the app entirely, we will give you reasonable notice in the app where we can.",
          ]}
        />
      </Section>

      <Section heading="Disclaimers">
        <p>
          The app is provided "as is" and "as available". To the extent the law allows, we do not
          promise that it will always be available, error free or secure, that lesson content or AI
          output is accurate, or that you will reach any particular level or pass any test. Nothing
          in these terms affects rights you have as a consumer that cannot be excluded by contract.
        </p>
      </Section>

      <Section heading="Limitation of liability">
        <p>
          To the extent the law allows, we are not liable for indirect, incidental, special or
          consequential loss, or for loss of data, profits or goodwill, arising from your use of the
          app. Our total liability to you for any claim about the app is limited to the greater of
          the amount you paid for Alphonso Pro in the 12 months before the claim arose and 50 US
          dollars. Nothing in these terms limits liability for death or personal injury caused by
          negligence, for fraud, or any other liability that cannot be limited by law.
        </p>
      </Section>

      <Section heading="Changes to these terms">
        <p>
          We may update these terms as the app changes. We will change the date at the top, and if a
          change is significant we will tell you in the app before it takes effect. If you keep
          using the app after a change takes effect, the updated terms apply. If you do not agree,
          delete your account and stop using the app.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by the laws of the Province of Ontario and the federal laws of
          Canada that apply there, and the courts of Ontario have non-exclusive jurisdiction. If you
          live outside Canada, you keep the protection of the mandatory consumer laws of the country
          where you live, and you can bring a claim in your local courts.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Learn with Alphonso is operated by {OPERATOR}. Write to {CONTACT} with any question,
          complaint or claim about these terms or the app. A person reads every message.
        </p>
      </Section>
    </LegalPage>
  );
}
