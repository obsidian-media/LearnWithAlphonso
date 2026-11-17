import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Icon } from "@/components/ds/Blocks";
import { dsButtonClass } from "@/components/ds/buttons";
import { DsIcon } from "@/components/ds/DsIcon";
import { canonicalLink, shareMeta } from "@/lib/seo";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    links: [canonicalLink("/")],
    meta: [
      ...shareMeta("/").filter((m) => m.property === "og:url"),
      { title: "Learn With Alphonso: Learn English, French and Spanish" },
      {
        name: "description",
        content:
          "Learn English, French or Spanish in a few minutes a day. Free account, a short level test to find your starting point, then 1,800+ short lessons with a daily review of the words you are about to forget.",
      },
      {
        property: "og:title",
        content: "Learn With Alphonso: Learn English, French and Spanish",
      },
      {
        property: "og:description",
        content:
          "Learn English, French or Spanish in a few minutes a day. Free on the web, iPhone beta open.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Learn With Alphonso" },
      { property: "og:image", content: "https://learn.alphonsoecosystem.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Alphonso the llama, mascot of Learn With Alphonso",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://learn.alphonsoecosystem.app/og-image.png" },
    ],
  }),
});

/** The facts a visitor can read before signing up. Every line is true of the app today. */
const LANGUAGES = [
  { name: "English", note: "American, A1 to C1" },
  { name: "Français", note: "A1 to C1" },
  { name: "Español", note: "A1 to C1" },
] as const;

const LESSON_POINTS = [
  {
    icon: "headphone",
    t: "Hear it first",
    d: "Questions are read aloud, in the voice you choose in Settings.",
  },
  {
    icon: "studio_microphone",
    t: "Say it out loud",
    d: "Speaking questions check what you said, not just what you tapped.",
  },
  {
    icon: "speech_balloon",
    t: "Write it yourself",
    d: "Translate and fill the gap, so you produce the language too.",
  },
] as const;

const FEATURES = [
  {
    icon: "books",
    t: "Short lessons",
    d: "1,800+ lessons from A1 to C1 across all three languages.",
  },
  {
    icon: "fire",
    t: "Streaks & freezes",
    d: "Study daily to build a streak. A freeze saves it if you miss a day, and you earn one every 10th streak day.",
  },
  {
    icon: "trophy",
    t: "Leagues",
    d: "Earn XP to climb five league tiers, from Sprout to Summit, and compare weekly with everyone, your friends or your country.",
  },
  {
    icon: "bullseye",
    t: "Start where you really are",
    d: "A short level test places you from A1 to C1, so nobody starts at hello by default.",
  },
  {
    icon: "sparkles",
    t: "A review that knows what you forget",
    d: "Missed words come back on a schedule, right before they slip.",
  },
  {
    icon: "headphone",
    t: "Listen on the go",
    d: "Short audio episodes with transcripts, on the web and iPhone.",
  },
] as const;

const FAQ = [
  {
    q: "Is it really free?",
    a: "Yes. Every course, the level test, the daily review, practice with Alphonso, listening and the leagues are free.",
  },
  {
    q: "Which English does it teach?",
    a: "American English: American spelling, words and pronunciation.",
  },
  {
    q: "Is there an iPhone app?",
    a: "The iPhone app is in a public beta through Apple's TestFlight. The web app works on any device today.",
  },
  {
    q: "Do the AI features send my voice anywhere?",
    a: "AI features run only after you allow them, and you can turn them off at any time. The Privacy Policy lists every provider and what each one receives. Lessons, review and the level test work with AI off.",
  },
  {
    q: "Can I delete my account and data?",
    a: "Yes, in the app, along with a full export of your data. No support ticket needed.",
  },
] as const;

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/learn", replace: true });
    });
  }, [navigate]);

  return (
    <div className="grain min-h-dvh bg-ds-surface text-ds-ink">
      <div className="mx-auto flex min-h-dvh max-w-[1040px] flex-col px-4 pb-10 pt-4 md:px-8">
        <header className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="" width={32} height={32} className="size-8 rounded-lg" />
            <span className="ds-type-headline font-extrabold text-ds-brand">Alphonso</span>
          </div>
          <Link to="/auth" className={dsButtonClass("secondary", { small: true })}>
            Sign in
          </Link>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 grid items-center gap-6 md:grid-cols-2 md:gap-12"
        >
          <div className="grid gap-4">
            <h1 className="ds-type-display-x-l text-balance text-ds-brand">
              Learn English, French or Spanish in a few minutes a day
            </h1>
            <p className="ds-type-body max-w-[420px] text-ds-ink-soft">
              Make a free account, take a short level test to find your starting point, then start
              your first lesson. Your progress follows you across devices.
            </p>
            <div className="grid max-w-[420px] gap-3">
              <Link to="/welcome" className={dsButtonClass("primary", { full: true })}>
                Get started — it's free
              </Link>
              <Link to="/auth" className={dsButtonClass("secondary", { full: true })}>
                I already have an account
              </Link>
            </div>
          </div>
          <div
            data-landing-room=""
            className="relative mx-auto aspect-[4/3] w-full max-w-[520px] overflow-hidden rounded-[var(--ds-radius-sheet)] bg-ds-sunk shadow-[var(--ds-shadow-floating)]"
          >
            <img
              src="/avatar/scenes/coffee.webp"
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            <img
              src="/figures/alphonso-waving.png"
              alt="Alphonso, a llama in a navy and gold robe, waving"
              className="absolute bottom-0 right-4 h-[88%] w-auto"
            />
          </div>
        </motion.section>

        <ul aria-label="Courses" className="mt-6 grid grid-cols-3 gap-2.5">
          {LANGUAGES.map((l) => (
            <li
              key={l.name}
              className="grid gap-0.5 rounded-[18px] border-2 border-ds-line bg-ds-card p-3 text-center"
            >
              <strong className="ds-type-headline text-ds-brand">{l.name}</strong>
              <span className="ds-type-caption text-ds-ink-soft">{l.note}</span>
            </li>
          ))}
        </ul>

        <section
          aria-labelledby="landing-lessons"
          className="mt-10 grid gap-4 md:grid-cols-2 md:gap-12"
        >
          <div className="grid content-start gap-2">
            <h2 id="landing-lessons" className="ds-type-title text-ds-brand">
              Lessons with a voice, a face and a room.
            </h2>
            <p className="ds-type-body text-ds-ink-soft">
              Alphonso asks, you answer. Each lesson mixes listening, speaking and writing, and
              takes a few minutes.
            </p>
          </div>
          <ul className="grid gap-2.5">
            {LESSON_POINTS.map((f) => (
              <li
                key={f.t}
                className="flex items-start gap-3 rounded-[22px] border-2 border-ds-line bg-ds-card p-3.5"
              >
                <Icon name={f.icon} size={36} />
                <div>
                  <p className="ds-type-headline text-ds-ink">{f.t}</p>
                  <p className="ds-type-footnote text-ds-ink-soft">{f.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="landing-around" className="mt-10 grid gap-4">
          <h2 id="landing-around" className="ds-type-title text-ds-brand">
            Everything around the lesson.
          </h2>
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } },
            }}
            className="grid gap-2.5 md:grid-cols-3"
          >
            {FEATURES.map((f) => (
              <motion.li
                key={f.t}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                className="flex items-start gap-3 rounded-[22px] border-2 border-ds-line bg-ds-card p-3.5"
              >
                <Icon name={f.icon} size={36} />
                <div>
                  <p className="ds-type-headline text-ds-ink">{f.t}</p>
                  <p className="ds-type-footnote text-ds-ink-soft">{f.d}</p>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </section>

        <section aria-labelledby="landing-faq" className="mt-10 grid gap-3">
          <h2 id="landing-faq" className="ds-type-title text-ds-brand">
            Questions people ask.
          </h2>
          <div className="grid gap-2">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-[18px] border-2 border-ds-line bg-ds-card px-4 py-1"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 ds-type-headline text-ds-ink">
                  {f.q}
                  <DsIcon
                    name="chevron"
                    className="size-5 shrink-0 text-ds-ink-soft transition-transform group-open:rotate-90"
                  />
                </summary>
                <p className="pb-3 ds-type-footnote text-ds-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10 grid justify-items-center gap-3 rounded-[var(--ds-radius-sheet)] bg-gradient-to-br from-ds-hero-a to-ds-hero-b p-6 text-center text-ds-on-hero shadow-[var(--ds-shadow-floating)]">
          <h2 className="ds-type-title">Your first lesson takes a few minutes.</h2>
          <p className="ds-type-footnote text-ds-on-hero-soft">
            Free account with email or Google.
          </p>
          <Link to="/welcome" className={`${dsButtonClass("primary")} w-full max-w-[420px]`}>
            Start your first lesson
          </Link>
        </section>

        <div className="mt-auto flex items-center justify-center gap-4 pt-8 ds-type-caption text-ds-ink-soft">
          <Link to="/support" className="inline-flex min-h-11 items-center hover:text-ds-ink">
            Support
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="inline-flex min-h-11 items-center hover:text-ds-ink">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="inline-flex min-h-11 items-center hover:text-ds-ink">
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link to="/cookies" className="inline-flex min-h-11 items-center hover:text-ds-ink">
            Cookies
          </Link>
        </div>
      </div>
    </div>
  );
}
