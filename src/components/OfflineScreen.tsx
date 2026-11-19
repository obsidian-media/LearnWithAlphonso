import { useRouter } from "@tanstack/react-router";
import { dsButtonClass } from "@/components/ds/buttons";

/** The signed-in app could not check the session because the network is down: wait and retry, never sign out. */
export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  const router = useRouter();
  return (
    <main
      id="main-content"
      data-offline=""
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
        <h1 className="m-0 font-display ds-type-display text-ds-ink">You&apos;re offline</h1>
        <p role="status" className="m-0 ds-type-footnote font-medium text-ds-ink-soft">
          We couldn&apos;t reach Alphonso. You&apos;re still signed in. Check your connection and
          try again.
        </p>
        <button
          type="button"
          onClick={() => {
            // beforeLoad only runs again once the router is invalidated.
            void router.invalidate();
            onRetry();
          }}
          className={`mt-2 ${dsButtonClass("primary")}`}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
