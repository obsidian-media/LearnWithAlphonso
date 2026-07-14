import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MobileFrame } from "../components/AppShell";
import { FlameIcon, BoltIcon, CheckIcon } from "../components/icons";
import { useProgress } from "../lib/progress";
import { allLessonIds } from "../data/curriculum";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — Lingua" },
      { name: "description", content: "Track your streak, XP, and lessons completed." },
    ],
  }),
  component: ProfilePage,
});

function last7Days() {
  const arr: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
}

function ProfilePage() {
  const { xp, streak, longestStreak, completedLessons, activityDates, reset, hydrated } =
    useProgress();
  const [confirming, setConfirming] = useState(false);
  const days = last7Days();
  const level = Math.floor((hydrated ? xp : 0) / 200) + 1;
  const total = allLessonIds.length;
  const done = hydrated ? completedLessons.length : 0;

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <header className="mb-8 flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-moss text-surface hard-shadow">
            <span className="font-display text-2xl font-semibold">L{level}</span>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
              Learner
            </p>
            <h1 className="font-display text-2xl font-semibold leading-tight">
              Level {level}
            </h1>
            <p className="text-sm text-ink-soft">
              {done} of {total} lessons complete
            </p>
          </div>
        </header>

        <div className="mb-8 grid grid-cols-3 gap-3">
          <Stat label="XP" value={hydrated ? xp : 0} icon={<BoltIcon className="size-4" />} color="text-moss" />
          <Stat
            label="Streak"
            value={hydrated ? streak : 0}
            icon={<FlameIcon className="size-4" />}
            color="text-ember"
          />
          <Stat
            label="Longest"
            value={hydrated ? longestStreak : 0}
            icon={<FlameIcon className="size-4" />}
            color="text-ink-soft"
          />
        </div>

        <section className="mb-8 rounded-2xl border border-hairline bg-surface p-5">
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            Last 7 days
          </p>
          <div className="flex justify-between">
            {days.map((d) => {
              const active = activityDates.includes(d);
              const dayLetter = new Date(d).toLocaleDateString("en", { weekday: "narrow" });
              return (
                <div key={d} className="flex flex-col items-center gap-2">
                  <div
                    className={`grid size-9 place-items-center rounded-full text-[11px] font-semibold ${
                      active ? "bg-moss text-surface" : "bg-parchment text-ink-soft/40"
                    }`}
                  >
                    {active ? <CheckIcon className="size-4" /> : ""}
                  </div>
                  <span className="text-[10px] font-medium text-ink-soft">{dayLetter}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="w-full rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-sm font-medium text-ink-soft"
            >
              Reset progress
            </button>
          ) : (
            <div className="rounded-2xl border border-ember/30 bg-ember/5 p-4">
              <p className="mb-3 text-sm font-medium text-ink">
                This clears all XP, streak, and lesson history. Continue?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-xl border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    reset();
                    setConfirming(false);
                  }}
                  className="flex-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-surface"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}

function Stat({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-parchment p-4">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="tnum font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </p>
    </div>
  );
}