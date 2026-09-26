import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, Bullets } from "../components/LegalPage";

/**
 * The Accessibility URL App Store Connect's Accessibility section links
 * to. Apple's bar for claiming a feature is that users must be able to
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
    meta: [
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
    <LegalPage title="Accessibility" updated="26 September 2026">
      <Section heading="Our position">
        <p>
          Learning a language should not depend on how well you see, hear or move. We would rather
          tell you plainly what works today than claim support you then discover is missing — so
          this page lists both.
        </p>
        <p>
          If something here is wrong, or something you need is missing, write to {CONTACT}. We read
          every message and we would rather hear it than not.
        </p>
      </Section>

      <Section heading="What we are building">
        <p>
          The following are implemented and shipping, and we are verifying each one on real devices
          before we claim it formally on the App Store:
        </p>
        <Bullets
          items={[
            "Larger Text: the app follows your system text size, including the accessibility sizes, rather than using fixed type.",
            "Dark Interface: the app follows your system appearance instead of forcing its own.",
            "VoiceOver: screens, controls and question results are labelled, and whether an answer was correct is announced rather than shown only in colour.",
            "Reduced Motion: animations are shortened or removed when you turn that setting on.",
          ]}
        />
      </Section>

      <Section heading="What we do not support yet">
        <Bullets
          items={[
            "Voice Control: not tested, so we do not claim it.",
            "Captions and audio descriptions: our audio library has written transcripts, but they are not synchronised captions.",
            "iPad and Apple Silicon Macs: the app is built for iPhone. It has not been tested elsewhere, so we do not offer it there.",
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
          more useful to us than naming a feature, and it is how the list above gets shorter.
        </p>
      </Section>
    </LegalPage>
  );
}
