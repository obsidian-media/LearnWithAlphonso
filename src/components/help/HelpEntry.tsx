import { Link } from "@tanstack/react-router";
import { SUPPORT_COPY } from "@/lib/support-copy";
import { HelpIcon } from "./HelpIcons";

/** The "Help" row in Settings (Profile on web): its own section between AI features and Account. */
export function HelpEntry() {
  return (
    <section aria-labelledby="help-heading">
      <h2 id="help-heading" className="mt-8 font-display ds-type-headline text-ds-ink">
        {SUPPORT_COPY.entryTitle}
      </h2>
      <Link
        to="/help"
        className="mt-3 flex min-h-14 items-center gap-3 rounded-2xl border border-ds-line bg-ds-sunk px-4 py-3 text-ds-ink"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-ds-choice text-ds-card">
          <HelpIcon name="life" className="size-[22px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block ds-type-headline">{SUPPORT_COPY.entryTitle}</span>
          <span className="block ds-type-caption text-ds-ink-soft">
            {SUPPORT_COPY.entrySubtitle}
          </span>
        </span>
        <HelpIcon name="forward" className="size-3.5 text-ds-ink-soft" />
      </Link>
    </section>
  );
}

/** "Get help" on a screen that reports a problem the learner cannot fix alone. Opens the Help chat. */
export function GetHelpLink({ className = "" }: { className?: string }) {
  // A plain link, not the router's: it sits on error screens and paywalls that can render without the router.
  return (
    <a
      href="/help"
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-ds-action px-3.5 ds-type-footnote font-extrabold text-ds-on-action shadow-[0_3px_0_var(--c-action-edge)] ${className}`}
    >
      <HelpIcon name="life" className="size-4" />
      {SUPPORT_COPY.getHelp}
    </a>
  );
}
