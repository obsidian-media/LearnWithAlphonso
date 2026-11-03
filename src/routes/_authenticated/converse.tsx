import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MobileFrame } from "../../components/AppShell";
import { useMemo } from "react";
import { campaignsFor } from "../../data/campaigns";
import { scenariosFor } from "../../data/scenarios";
import { useProgress } from "../../lib/progress";
import { tileTone } from "../../lib/tile-tones";
import { Icon3D } from "../../components/Icon3D";
import { TileCard } from "../../components/ui/TileCard";

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
  // Titles, blurbs and the linked conversation follow the active course.
  const course = useProgress((s) => s.course);
  const scenarios = useMemo(() => scenariosFor(course), [course]);
  const campaigns = useMemo(() => campaignsFor(course), [course]);
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

        {/* V4 candidate #4: connected multi-scene campaigns, additive
            alongside the one-shot scenarios below -- see
            docs/superpowers/specs/2026-09-21-conversation-campaigns-design.md */}
        {campaigns.length > 0 && (
          <div className="mt-7 grid grid-cols-1 gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft/60">
              Campaigns
            </p>
            {campaigns.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  to="/campaign/$campaignId"
                  params={{ campaignId: c.id }}
                  data-campaign-hero=""
                  className="card-lift flex items-center gap-4 rounded-3xl bg-gradient-to-br from-moss to-moss-deep p-4 text-primary-foreground transition-transform active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
                      Campaign · {c.level}
                    </p>
                    <h2 className="mt-0.5 font-display text-xl font-bold leading-tight">
                      {c.title}
                    </h2>
                    <p className="mt-0.5 text-xs opacity-85">{c.blurb}</p>
                    <span className="mt-2 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]">
                      {c.scenes.length} scenes
                    </span>
                  </div>
                  <Icon3D emoji={c.emoji} size={64} className="shrink-0" />
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        <p className="mb-2 mt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft/60">
          Scenarios
        </p>
        <div className="grid grid-cols-2 gap-3">
          {scenarios.map((s, i) => (
            <motion.div
              key={s.id}
              data-scenario-tile=""
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to="/converse/$scenarioId"
                params={{ scenarioId: s.id }}
                className="block h-full rounded-3xl transition-transform active:scale-[0.98]"
              >
                <TileCard
                  tone={tileTone(i)}
                  icon={s.emoji}
                  title={s.title}
                  subtitle={s.blurb}
                  badge={s.level}
                />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </MobileFrame>
  );
}
