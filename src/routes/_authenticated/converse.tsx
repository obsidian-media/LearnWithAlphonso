import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MobileFrame } from "../../components/AppShell";
import { SCENARIOS } from "../../data/scenarios";
import { useTheme } from "../../lib/theme";

export const Route = createFileRoute("/_authenticated/converse")({
  component: ConversePage,
  head: () => ({
    meta: [
      { title: "Converse — Alphonso" },
      {
        name: "description",
        content: "Voice roleplay with an AI English tutor: coffee shop, job interview, and more.",
      },
      { property: "og:title", content: "Converse — Alphonso" },
      {
        property: "og:description",
        content: "Practice real English conversations with an AI tutor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ConversePage() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  return (
    <MobileFrame>
      <div className="px-6 pb-10 pt-6">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
          Conversation partner
        </p>
        <h1 className="text-balance font-display text-[28px] font-semibold leading-[1.05] text-ink">
          Practice out loud
        </h1>
        <p className="mt-1.5 max-w-[320px] text-sm text-ink-soft/80">
          Pick a scene and roleplay with an AI tutor. Type or hold to speak — get a natural reply
          back.
        </p>

        <div className={isStudioInk ? "mt-7 divide-y divide-hairline" : "mt-7 grid grid-cols-1 gap-3"}>
          {SCENARIOS.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to="/converse/$scenarioId"
                params={{ scenarioId: s.id }}
                className={
                  isStudioInk
                    ? "flex items-center gap-4 py-4 transition-opacity hover:opacity-80"
                    : "hard-shadow flex items-center gap-4 rounded-2xl border border-hairline bg-surface p-4 transition-transform active:scale-[0.99]"
                }
              >
                <div
                  className={
                    isStudioInk
                      ? "grid size-12 shrink-0 place-items-center text-2xl"
                      : "grid size-12 shrink-0 place-items-center rounded-xl bg-parchment text-2xl"
                  }
                >
                  {s.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-display text-base font-semibold text-ink">
                      {s.title}
                    </h2>
                    <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-soft/70">
                      {s.level}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-soft/80">{s.blurb}</p>
                </div>
                <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-soft/50" fill="none">
                  <path
                    d="M9 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </MobileFrame>
  );
}
