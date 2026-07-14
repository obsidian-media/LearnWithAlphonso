import { createFileRoute } from "@tanstack/react-router";
import { MobileFrame } from "../components/AppShell";
import { useProgress } from "../lib/progress";

export const Route = createFileRoute("/league")({
  head: () => ({
    meta: [
      { title: "Weekly League — Lingua" },
      { name: "description", content: "See how your XP stacks up this week." },
    ],
  }),
  component: LeaguePage,
});

type Player = { name: string; xp: number; initials: string };

const seed: Player[] = [
  { name: "Elena Vasquez", xp: 2480, initials: "EV" },
  { name: "Marcus Rivera", xp: 2210, initials: "MR" },
  { name: "Julianna Doss", xp: 1980, initials: "JD" },
  { name: "Kenji Sato", xp: 1750, initials: "KS" },
  { name: "Amara Okafor", xp: 1620, initials: "AO" },
  { name: "Priya Nair", xp: 1480, initials: "PN" },
  { name: "Leo Bianchi", xp: 1360, initials: "LB" },
  { name: "Noor Haddad", xp: 1240, initials: "NH" },
  { name: "Tomás Ferreira", xp: 1090, initials: "TF" },
  { name: "Sofia Lindqvist", xp: 940, initials: "SL" },
  { name: "Rafael Costa", xp: 820, initials: "RC" },
  { name: "Ines Moreau", xp: 690, initials: "IM" },
  { name: "Jonas Weber", xp: 540, initials: "JW" },
  { name: "Yuki Tanaka", xp: 410, initials: "YT" },
  { name: "Aisha Bello", xp: 320, initials: "AB" },
];

const medal = ["bg-amber-400 text-ink", "bg-zinc-300 text-ink", "bg-orange-300 text-ink"];

function LeaguePage() {
  const xp = useProgress((s) => s.xp);
  const hydrated = useProgress((s) => s.hydrated);

  const players = [...seed, { name: "You", xp: hydrated ? xp : 0, initials: "YU" }].sort(
    (a, b) => b.xp - a.xp,
  );

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <header className="mb-8">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
            This Week
          </p>
          <h1 className="font-display text-[28px] font-semibold leading-tight">
            Sapphire League
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Finish top 10 to advance. 3 days remaining.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
          {players.map((p, i) => {
            const isYou = p.name === "You";
            return (
              <div
                key={i}
                className={`flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-b-0 ${
                  isYou ? "bg-moss/5" : ""
                }`}
              >
                <div
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold tnum ${
                    i < 3 ? medal[i] : "bg-parchment text-ink-soft"
                  }`}
                >
                  {i + 1}
                </div>
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                    isYou ? "bg-moss text-surface" : "bg-parchment text-ink-soft"
                  }`}
                >
                  {p.initials}
                </div>
                <div className="flex-1">
                  <p className={`text-sm ${isYou ? "font-semibold text-moss" : "font-medium text-ink"}`}>
                    {p.name}
                  </p>
                </div>
                <span className="tnum text-sm font-semibold text-ink-soft">
                  {p.xp.toLocaleString()} XP
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </MobileFrame>
  );
}