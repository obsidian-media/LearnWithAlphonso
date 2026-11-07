import { useState } from "react";
import type { PodcastQuizOffer } from "../lib/podcast-quiz.functions";
import { useProgress } from "../lib/progress";
import { PodcastQuiz } from "./PodcastQuiz";

/**
 * "Take the quiz" on an episode's row, for an episode that has one: a replay, or a first try for a learner who
 * listened on another device, without listening to the episode again. The quiz itself is the same dialog the player
 * offers after an episode; this only fetches it on demand.
 */
export function PodcastQuizLauncher({
  episode,
}: {
  episode: { id: string; title: string; course?: string | null };
}) {
  const activeCourse = useProgress((s) => s.course);
  const [offer, setOffer] = useState<PodcastQuizOffer | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const start = async () => {
    setFailed(false);
    if (offer) {
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const { fetchPodcastQuiz } = await import("../lib/podcast-quiz.functions");
      const found = await fetchPodcastQuiz({ data: { episodeId: episode.id } });
      if (found) {
        setOffer(found);
        setOpen(true);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={loading}
        aria-label={`Take the quiz: ${episode.title}`}
        className="rounded-full border border-ds-line px-3 py-1.5 text-xs font-medium text-ds-brand disabled:opacity-50"
      >
        {loading ? "Loading quiz…" : "Take the quiz"}
      </button>
      {failed ? (
        <span role="alert" className="ml-2 text-xs text-rose-600">
          The quiz isn&apos;t available right now.
        </span>
      ) : null}
      {open && offer ? (
        <PodcastQuiz
          title={episode.title}
          episodeId={episode.id}
          course={episode.course ?? activeCourse}
          questions={offer.questions}
          best={offer.best}
          onClose={() => setOpen(false)}
          onSaved={(result) =>
            // Reopening shows the better best without another read.
            setOffer((current) =>
              current
                ? { ...current, best: { correct: result.bestCorrect, xp: result.bestXp } }
                : current,
            )
          }
        />
      ) : null}
    </>
  );
}
