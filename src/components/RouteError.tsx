import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { dsButtonClass } from "@/components/ds/buttons";
import { reportError } from "@/lib/error-reporting";

/**
 * A signed-in page that threw while loading or rendering. Before this only the root had a boundary, so one broken
 * page replaced the whole app with a dead end; now the page says so in place, with Try again and the way back to
 * Learn, and the rest of the app (sign-in, the cookie choice, audio) stays as it was.
 */
export function RouteError({
  error,
  reset,
  boundary,
}: {
  error: unknown;
  reset: () => void;
  /** Which route's boundary caught it, for the error report. */
  boundary: string;
}) {
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary });
  }, [error, boundary]);
  return (
    <main
      id="main-content"
      data-route-error={boundary}
      className="grain flex min-h-dvh items-center justify-center bg-ds-surface px-6 py-10 text-ds-ink"
    >
      <div className="grid w-full max-w-[430px] justify-items-center gap-3 text-center">
        <img
          src="/mascots/alphonso-sleepy-night.webp"
          alt=""
          height={200}
          className="h-[200px] w-auto"
          draggable={false}
        />
        <h1 className="m-0 font-display ds-type-display text-ds-ink">This page didn&apos;t load</h1>
        <p role="alert" className="m-0 ds-type-footnote font-medium text-ds-ink-soft">
          Something went wrong. Your progress is safe. Try again, or go back to Learn.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className={dsButtonClass("primary")}
          >
            Try again
          </button>
          <Link to="/learn" onClick={() => reset()} className={dsButtonClass("secondary")}>
            Back to Learn
          </Link>
        </div>
      </div>
    </main>
  );
}
