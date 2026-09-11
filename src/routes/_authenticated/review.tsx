import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { LessonFrame } from "../../components/AppShell";
import { lookupQuestion } from "../../data/curriculum";
import type { Question } from "../../data/curriculum";
import { fetchDueReviews, gradeReview } from "../../lib/review.functions";

export const Route = createFileRoute("/_authenticated/review")({
  component: ReviewPage,
  head: () => ({
    meta: [
      { title: "Review — Alphonso" },
      {
        name: "description",
        content: "Spaced-repetition review of the questions you got wrong.",
      },
      { property: "og:title", content: "Review — Alphonso" },
      {
        property: "og:description",
        content: "Bring back the items you missed, exactly when you're about to forget them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Card = { itemKey: string; question: Question };

function ReviewPage() {
  const load = useServerFn(fetchDueReviews);
  const grade = useServerFn(gradeReview);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [stats, setStats] = useState({ right: 0, wrong: 0, retired: 0 });

  useEffect(() => {
    let alive = true;
    void load()
      .then((res) => {
        if (!alive) return;
        const built: Card[] = [];
        for (const item of res.due) {
          const ref = lookupQuestion(item.itemKey);
          if (ref) built.push({ itemKey: item.itemKey, question: ref.question });
        }
        setCards(built);
        setTotal(res.total);
      })
      .catch(() => setCards([]));
    return () => {
      alive = false;
    };
  }, [load]);

  const card = cards && idx < cards.length ? cards[idx] : null;
  const q = card?.question;
  const isCorrect = useMemo(() => {
    if (!q || picked === null) return false;
    return q.type === "mc"
      ? q.choices[q.answer] === picked
      : picked.trim().toLowerCase() === q.answer.trim().toLowerCase();
  }, [q, picked]);

  function check() {
    if (!card || !picked) return;
    setChecked(true);
    const ok = isCorrect;
    setStats((s) => ({ ...s, right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    void grade({ data: { itemKey: card.itemKey, correct: ok } })
      .then((r) => {
        if (r.retired) setStats((s) => ({ ...s, retired: s.retired + 1 }));
      })
      .catch(() => {});
  }

  function next() {
    setIdx((i) => i + 1);
    setPicked(null);
    setChecked(false);
  }

  if (cards === null) {
    return (
      <LessonFrame>
        <div className="grid flex-1 place-items-center p-6 text-sm text-ink-soft">
          Loading your review queue…
        </div>
      </LessonFrame>
    );
  }

  if (cards.length === 0) {
    return (
      <LessonFrame>
        <Empty
          title="Nothing due today"
          body={
            total > 0
              ? `You have ${total} item${total === 1 ? "" : "s"} in review — none are due yet. Come back tomorrow.`
              : "Miss a question in a lesson and it lands here, returning at widening intervals until it sticks."
          }
        />
      </LessonFrame>
    );
  }

  if (!card || !q) {
    return (
      <LessonFrame>
        <Empty
          title="Review complete"
          body={`${stats.right} correct · ${stats.wrong} to revisit${
            stats.retired ? ` · ${stats.retired} mastered and retired` : ""
          }.`}
        />
      </LessonFrame>
    );
  }

  return (
    <LessonFrame>
      <div className="flex items-center gap-3 px-5 pt-5">
        <Link
          to="/learn"
          aria-label="Close review"
          className="grid size-8 place-items-center rounded-full text-ink-soft/70 hover:bg-parchment"
        >
          ✕
        </Link>
        <div className="flex-1 overflow-hidden rounded-full bg-parchment">
          <div
            className="h-2 rounded-full bg-ember transition-all"
            style={{ width: `${(idx / cards.length) * 100}%` }}
          />
        </div>
        <span className="tnum text-[11px] font-medium text-ink-soft">
          {idx + 1}/{cards.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6 pt-8">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ember">
          Spaced review
        </p>
        <h2 className="font-display text-[22px] font-semibold leading-tight text-ink">
          {q.prompt}
        </h2>

        <div className="mt-6 space-y-2.5">
          {q.type === "mc" ? (
            q.choices.map((c) => {
              const isPicked = picked === c;
              const right = q.choices[q.answer] === c;
              return (
                <button
                  key={c}
                  disabled={checked}
                  onClick={() => setPicked(c)}
                  className={`w-full rounded-2xl border px-4 py-3.5 text-left text-sm transition ${
                    checked && right
                      ? "border-moss bg-moss/10 text-ink"
                      : checked && isPicked
                        ? "border-rose-400 bg-rose-50 text-ink"
                        : isPicked
                          ? "border-ink bg-parchment text-ink"
                          : "border-hairline bg-surface text-ink hover:border-ink/30"
                  }`}
                >
                  {c}
                </button>
              );
            })
          ) : (
            <div>
              <input
                type="text"
                disabled={checked}
                value={picked ?? ""}
                onChange={(e) => setPicked(e.target.value)}
                placeholder="Type your answer"
                className="w-full rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-sm outline-none focus:border-moss"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {q.bank.map((w) => (
                  <button
                    key={w}
                    disabled={checked}
                    onClick={() => setPicked(w)}
                    className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {checked && (
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              isCorrect
                ? "border-moss/40 bg-moss/10 text-ink"
                : "border-rose-300 bg-rose-50 text-ink"
            }`}
          >
            <p className="font-semibold">{isCorrect ? "Still got it." : "Back in the queue."}</p>
            <p className="mt-0.5 text-ink-soft">{q.explanation}</p>
          </div>
        )}

        <div className="mt-auto pt-6">
          {!checked ? (
            <button
              disabled={!picked}
              onClick={check}
              className="w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-40"
            >
              Check
            </button>
          ) : (
            <button
              onClick={next}
              className="w-full rounded-full bg-ember px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90"
            >
              {idx < cards.length - 1 ? "Continue" : "Finish"}
            </button>
          )}
        </div>
      </div>
    </LessonFrame>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-1 flex-col items-center justify-center px-8 text-center"
    >
      <div className="mb-5 grid size-16 place-items-center rounded-full bg-moss text-surface hard-shadow">
        <svg viewBox="0 0 24 24" className="size-8" fill="none">
          <path
            d="m6 12 4 4 8-9"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="font-display text-[22px] font-semibold text-ink">{title}</h1>
      <p className="mt-2 max-w-[280px] text-sm text-ink-soft/80">{body}</p>
      <Link
        to="/learn"
        className="mt-8 w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface"
      >
        Back to path
      </Link>
    </motion.div>
  );
}
