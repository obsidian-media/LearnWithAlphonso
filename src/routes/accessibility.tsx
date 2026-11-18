import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, Bullets } from "../components/LegalPage";
import { canonicalLink, shareMeta } from "@/lib/seo";

/**
 * The Accessibility URL App Store Connect's Accessibility section links
 * to, and the accessibility page for the website and the Android app. Apple's bar for claiming a feature is that users must be able to
 * complete the app's common tasks using it -- so this page says what is
 * actually true today, including what is not supported yet.
 *
 * Kept deliberately honest: a page claiming support that a blind or
 * low-vision user then cannot find is worse than one that admits the
 * gap, because it costs them the time of trying.
 */
const CONTACT = "support@alphonsoecosystem.app";

export const Route = createFileRoute("/accessibility")({
  component: Accessibility,
  head: () => ({
    links: [canonicalLink("/accessibility")],
    meta: [
      ...shareMeta("/accessibility"),
      { title: "Accessibility — Alphonso" },
      {
        name: "description",
        content:
          "What accessibility features Learn with Alphonso supports, what it does not yet support, and how to tell us what you need.",
      },
      { property: "og:title", content: "Accessibility — Alphonso" },
      {
        property: "og:description",
        content: "Accessibility support in Learn with Alphonso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Accessibility() {
  return (
    <LegalPage title="Accessibility" updated="18 November 2026">
      <Section heading="Our position">
        <p>
          Learning a language should not depend on how well you see, hear or move. We would rather
          tell you plainly what works today than claim support you then discover is missing — so
          this page lists both. It covers the website at learn.alphonsoecosystem.app, the iPhone app
          and the Android app.
        </p>
        <p>
          Our goal is for the website and both apps to meet the Web Content Accessibility Guidelines
          (WCAG) 2.2 at level AA. That is a target we are working towards, not a claim that we meet
          it today: the app has not been independently audited or certified. Automated accessibility
          checks run on our public web pages with every change, and we fix what they find.
        </p>
        <p>
          If something here is wrong, or something you need is missing, write to {CONTACT}. We read
          every message and we would rather hear it than not.
        </p>
      </Section>

      <Section heading="What we are building">
        <p>
          The following are implemented and shipping, and we are verifying each one on real devices
          before we claim it formally in the App Store or on Google Play:
        </p>
        <Bullets
          items={[
            "Larger text: the iPhone app follows your system text size, including the accessibility sizes, and the Android app follows your font size setting, rather than using fixed type. On the website, you can use your browser's zoom.",
            "Dark mode: the Royal theme follows your device's light or dark setting on the website, iPhone and Android. Meadow is a light theme.",
            "Screen readers: in the iPhone app (VoiceOver) and the Android app (TalkBack), screens, controls and question results are labelled, and whether an answer was correct is announced rather than shown only in colour. The website labels its controls for screen readers in the same way.",
            "Reduced motion: animations are shortened or removed when you turn on Reduce Motion on iPhone, Remove animations on Android, or the reduced motion setting your browser follows.",
          ]}
        />
      </Section>

      <Section heading="What we do not support yet">
        <Bullets
          items={[
            "Voice Control and Voice Access: not tested, so we do not claim them.",
            "Captions and audio descriptions: our audio library has written transcripts, but they are not synchronised captions.",
            "iPad and Apple Silicon Macs: the iOS app is built for iPhone. It has not been tested elsewhere, so we do not offer it there.",
          ]}
        />
      </Section>

      <Section heading="Speaking practice and hearing">
        <p>
          Speaking practice and the AI tutor use your microphone, and the audio library is spoken
          content. These parts of the app are difficult or impossible to use without hearing or
          speech, and we do not currently offer a text-only equivalent for all of them. Lessons,
          reading, writing and review do not require audio.
        </p>
      </Section>

      <Section heading="Telling us what you need">
        <p>
          Write to {CONTACT}. Describe what you were trying to do and what got in the way — that is
          more useful to us than naming a feature, and it is how the list above gets shorter. Tell
          us whether you were on the website, the iPhone app or the Android app.
        </p>
      </Section>
    </LegalPage>
  );
}
