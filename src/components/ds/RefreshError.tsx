import { DsButton } from "@/components/ds/Blocks";

/**
 * A background refetch failed but the list already on screen is still shown: say so in one line, with Try again,
 * instead of swapping the list for the full error state (that is only for when there is nothing to show).
 */
export function RefreshError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2.5">
      <p className="ds-type-footnote min-w-0 flex-1 text-ds-wrong-ink">Couldn't refresh {what}.</p>
      <DsButton small variant="secondary" onClick={onRetry}>
        Try again
      </DsButton>
    </div>
  );
}
