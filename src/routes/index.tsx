import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Learn with Alphonso — English, one lesson at a time" },
      {
        name: "description",
        content:
          "A calm, gamified way to build real English skills. Bite-size lessons, streaks, leagues, and progress that syncs across devices.",
      },
      { property: "og:title", content: "Learn with Alphonso — English, one lesson at a time" },
      {
        property: "og:description",
        content: "Bite-size English lessons, streaks, and leagues that stay with you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/learn", replace: true });
    });
  }, [navigate]);

  return (
    <div className="grain min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-6 pb-10 pt-14">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-2"
        >
          <div className="grid size-8 place-items-center rounded-lg bg-moss text-surface">
            <span className="font-display text-sm font-semibold">A</span>
          </div>
          <span className="font-display text-[16px] font-semibold tracking-tight text-ink">
            Alphonso
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mt-16"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
            English, quietly built
          </p>
          <h1 className="text-balance font-display text-[40px] font-semibold leading-[1.02] tracking-tight text-ink">
            Learn English with lessons that actually stick.
          </h1>
          <p className="mt-4 max-w-[320px] text-[15px] leading-relaxed text-ink-soft">
            Bite-size lessons, warm gamified streaks, and weekly leagues — synced to your account so
            your progress follows you anywhere.
          </p>
        </motion.div>

        <motion.ul
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } },
          }}
          className="mt-10 space-y-3"
        >
          {[
            { t: "Bite-size lessons", d: "5-minute reps designed to build real fluency." },
            { t: "Streaks & freezes", d: "Warm gamification that respects your time." },
            { t: "Weekly leagues", d: "Global, friends and country boards to compete." },
          ].map((f) => (
            <motion.li
              key={f.t}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              className="flex items-start gap-3 rounded-2xl border border-hairline bg-parchment p-3.5"
            >
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-moss text-surface">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                  <path
                    d="m6 12 4 4 8-9"
                    stroke="white"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{f.t}</p>
                <p className="text-xs text-ink-soft">{f.d}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>

        <div className="mt-auto pt-10">
          <Link
            to="/auth"
            className="block w-full rounded-full bg-ember px-4 py-3.5 text-center text-sm font-semibold text-surface transition hover:opacity-90"
          >
            Get started — it's free
          </Link>
          <p className="mt-3 text-center text-[11px] text-ink-soft/70">
            Sign in to sync your streak across devices.
          </p>
          <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-ink-soft/60">
            <Link to="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <span aria-hidden>·</span>
            <Link to="/terms" className="hover:text-ink">
              Terms
            </Link>
            <span aria-hidden>·</span>
            <Link to="/cookies" className="hover:text-ink">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
