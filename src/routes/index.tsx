import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "../lib/theme";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Learn With Alphonso: Learn English, French and Spanish" },
      {
        name: "description",
        content:
          "Learn English, French or Spanish in 5 minutes a day. Free account, a short level test to find your starting point, then 1,800+ short lessons with a daily review of the words you are about to forget.",
      },
      {
        property: "og:title",
        content: "Learn With Alphonso: Learn English, French and Spanish",
      },
      {
        property: "og:description",
        content:
          "Learn English, French or Spanish in 5 minutes a day. Free on the web, iPhone beta open.",
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

function Landing() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
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
          <img src="/icon-192.png" alt="" width={32} height={32} className="size-8 rounded-lg" />
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
            English, French &amp; Spanish, free
          </p>
          <h1 className="text-balance font-display text-[40px] font-semibold leading-[1.02] tracking-tight text-ink">
            Learn English, French or Spanish in 5 minutes a day
          </h1>
          <p className="mt-4 max-w-[320px] text-[15px] leading-relaxed text-ink-soft">
            Make a free account, take a short level test to find your starting point, then start
            your first lesson. Your progress follows you across devices.
          </p>
        </motion.div>

        <motion.ul
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } },
          }}
          className={isStudioInk ? "mt-10 divide-y divide-hairline" : "mt-10 space-y-3"}
        >
          {[
            { t: "Short lessons", d: "1,800+ lessons from A1 to C1 across all three languages." },
            {
              t: "Streaks & freezes",
              d: "Study daily to build a streak. A freeze saves it if you miss a day, and you earn one every 10th streak day.",
            },
            {
              t: "Leagues",
              d: "Earn XP to climb five league tiers, from Sprout to Summit, and compare weekly with everyone, your friends or your country.",
            },
          ].map((f) => (
            <motion.li
              key={f.t}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              className={
                isStudioInk
                  ? "flex items-start gap-3 py-3.5"
                  : "flex items-start gap-3 rounded-2xl border border-hairline bg-parchment p-3.5"
              }
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
            className="block w-full rounded-full bg-ember px-4 py-3.5 text-center text-sm font-semibold text-ink-on-ember transition hover:opacity-90"
          >
            Get started — it's free
          </Link>
          <p className="mt-3 text-center text-[11px] text-ink-soft/70">
            Free account with email or Google.
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
