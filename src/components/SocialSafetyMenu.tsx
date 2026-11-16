import { useId, useRef, useState } from "react";
import { blockUser, reportTeamName, reportUser } from "../lib/social-safety.functions";
import { socialFailureMessage } from "../lib/social-reason-copy";
import { DsButton } from "./ds/Blocks";
import { Modal } from "./Modal";

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "fake_account", label: "Fake account" },
  { value: "other", label: "Something else" },
] as const;

type ReportReason = (typeof REPORT_REASONS)[number]["value"];

/**
 * The "..." Block/Report menu -- shared by league.tsx, profile_.friends.tsx,
 * the buddy and team-member rows and duels.tsx. A duel row carries no name
 * (getMyDuels' response has no display-name field), so duels pass the
 * generic "this opponent", exactly as DuelsView.swift and DuelsScreen.kt
 * do: the menu acts on the opponent's id. A team's NAME, which has no
 * person attached, uses TeamNameReportMenu below. Kept as one
 * component rather than duplicated per route, same reasoning as the iOS
 * version's own doc comment: the report flow is genuinely identical
 * everywhere it appears, so duplicating it would just be drift waiting to
 * happen.
 */
export function SocialSafetyMenu({
  userId,
  displayName,
  onBlocked,
  onRemove,
  blockTitle,
  menuLabel,
}: {
  userId: string;
  displayName: string;
  onBlocked?: () => void;
  /** When set, the menu starts with "Remove friend" (the Friends rows: the row stays one line on a phone). */
  onRemove?: () => void;
  /** The block dialog's title; defaults to "Block <name>?". */
  blockTitle?: string;
  /** The menu button's accessible name; defaults to "More options for <name>". */
  menuLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"block" | "report" | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={menuLabel ?? `More options for ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className="grid size-7 shrink-0 place-items-center rounded-full text-ds-ink-soft/70 hover:bg-ds-sunk"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>

      {menuOpen && (
        <>
          {/* Click-outside dismissal -- a full-viewport transparent layer
              under the menu, above everything else. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-[14px] border-2 border-ds-line bg-ds-card shadow-[var(--ds-shadow-floating)]"
          >
            {onRemove && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onRemove();
                }}
                className="block min-h-11 w-full px-3 py-2 text-left ds-type-footnote font-extrabold text-ds-ink hover:bg-ds-sunk"
              >
                Remove friend
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setDialog("block");
              }}
              className="block min-h-11 w-full px-3 py-2 text-left ds-type-footnote font-extrabold text-ds-wrong-ink hover:bg-ds-sunk"
            >
              Block user
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setDialog("report");
              }}
              className="block min-h-11 w-full px-3 py-2 text-left ds-type-footnote font-extrabold text-ds-ink hover:bg-ds-sunk"
            >
              Report user
            </button>
          </div>
        </>
      )}

      {dialog === "block" && (
        <BlockConfirmDialog
          displayName={displayName}
          title={blockTitle}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            // Only a block the server accepted counts: a failure keeps the dialog open and says why.
            try {
              const result = await blockUser({ data: { userId } });
              if (!result.ok) return `Couldn't block ${displayName}. Try again.`;
            } catch (e) {
              return socialFailureMessage(e);
            }
            setDialog(null);
            onBlocked?.();
            return null;
          }}
        />
      )}

      {dialog === "report" && (
        <ReportDialog
          title={`Report ${displayName}`}
          question="Why are you reporting this person?"
          submit={async (reason) => {
            try {
              const result = await reportUser({ data: { userId, reason } });
              return result.ok ? null : REPORT_FAILED;
            } catch {
              return REPORT_FAILED;
            }
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** Shown when a report did not reach the server; the report stays open so the learner can try again. */
export const REPORT_FAILED = "Couldn't submit your report. Try again.";

/** You created this team: there is no one else to report. */
export const REPORT_OWN_TEAM = "This is your own team, so there is nothing to report.";

/** A team with no creator has a system-made name, so there is no one to report. */
export const REPORT_NO_CREATOR =
  "This team's name was generated automatically by Alphonso, so there's no one to report.";

/**
 * The "..." menu on a team in the top-teams list: one entry, "Report team name" (the iOS and Android menus have the
 * same single entry; there is no block, since a team name has no person to block). Hidden by the caller on the
 * team the learner owns, who cannot report themselves.
 */
export function TeamNameReportMenu({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`More options for ${teamName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className="grid size-11 shrink-0 place-items-center rounded-full text-ds-ink-soft/70 hover:bg-ds-sunk"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
      {menuOpen && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-[14px] border-2 border-ds-line bg-ds-card shadow-[var(--ds-shadow-floating)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setReporting(true);
              }}
              className="block min-h-11 w-full px-3 py-2 text-left ds-type-footnote font-extrabold text-ds-ink hover:bg-ds-sunk"
            >
              Report team name
            </button>
          </div>
        </>
      )}
      {reporting && (
        <ReportDialog
          title={`Report ${teamName}`}
          question="Why are you reporting this team name?"
          submit={async (reason) => {
            try {
              const result = await reportTeamName({ data: { teamId, reason } });
              if (result.ok) return null;
              if (result.reason === "no-creator") return REPORT_NO_CREATOR;
              return result.reason === "own-team" ? REPORT_OWN_TEAM : REPORT_FAILED;
            } catch {
              return REPORT_FAILED;
            }
          }}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}

function DialogFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  // The app's own dialog: Escape closes it, Tab stays inside, everything behind is inert, focus returns on close.
  return (
    <Modal
      labelledBy={titleId}
      onEscape={onClose}
      className="relative w-full max-w-[430px] rounded-t-[28px] bg-ds-surface px-4 pb-6 pt-4 shadow-[var(--ds-shadow-sheet)] outline-none sm:rounded-[28px]"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <img src="/icons3d/shield.png" alt="" width={38} height={38} draggable={false} />
        <h2 id={titleId} className="ds-type-headline min-w-0 flex-1 text-ds-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 place-items-center rounded-full text-ds-ink-soft hover:bg-ds-sunk"
        >
          ✕
        </button>
      </div>
      {children}
    </Modal>
  );
}

function BlockConfirmDialog({
  displayName,
  title,
  onCancel,
  onConfirm,
}: {
  displayName: string;
  title?: string;
  onCancel: () => void;
  /** Resolves to null on success, or the words to show when the block failed. */
  onConfirm: () => Promise<string | null>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogFrame title={title ?? `Block ${displayName}?`} onClose={onCancel}>
      <p className="mb-4 ds-type-footnote text-ds-ink-soft">
        {displayName.charAt(0).toUpperCase() + displayName.slice(1)} won't be able to add you as a
        friend or challenge you to a duel, and you won't see them in friends, activity, or
        leaderboards. Contact support@alphonsoecosystem.app if you need help with this.
      </p>
      {error && (
        <p role="alert" className="mb-3 ds-type-footnote font-bold text-ds-wrong-ink">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <DsButton small variant="secondary" onClick={onCancel}>
          Cancel
        </DsButton>
        <DsButton
          small
          variant="danger"
          disabled={isSubmitting}
          onClick={async () => {
            setIsSubmitting(true);
            setError(null);
            const failure = await onConfirm();
            if (failure) {
              setError(failure);
              setIsSubmitting(false);
            }
          }}
        >
          {isSubmitting ? "Blocking…" : "Block"}
        </DsButton>
      </div>
    </DialogFrame>
  );
}

function ReportDialog({
  title,
  question,
  submit,
  onClose,
}: {
  title: string;
  /** The question the reasons answer; read out as the group's name. */
  question: string;
  /** Files the report. Resolves to null when the server accepted it, or the words to show when it did not. */
  submit: (reason: ReportReason) => Promise<string | null>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [didSubmit, setDidSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (didSubmit) {
    return (
      <DialogFrame title="Report submitted" onClose={onClose}>
        <p className="ds-type-footnote text-ds-ink-soft">
          Thanks for letting us know. Our team reviews every report. If you need to follow up,
          contact support@alphonsoecosystem.app.
        </p>
        <div className="mt-4 flex justify-end">
          <DsButton small onClick={onClose}>
            Done
          </DsButton>
        </div>
      </DialogFrame>
    );
  }

  return (
    <DialogFrame title={title} onClose={onClose}>
      <fieldset className="mb-4 grid gap-2">
        <legend className="sr-only">{question}</legend>
        {REPORT_REASONS.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[14px] border-2 border-b-4 px-3 ds-type-headline text-ds-ink ${
              reason === option.value
                ? "border-ds-choice bg-ds-choice-tint"
                : "border-ds-line bg-ds-card"
            }`}
          >
            <input
              type="radio"
              name="report-reason"
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
              className="size-4 accent-ds-choice"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="mb-3 ds-type-footnote font-bold text-ds-wrong-ink">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <DsButton small variant="secondary" onClick={onClose}>
          Cancel
        </DsButton>
        <DsButton
          small
          disabled={isSubmitting}
          onClick={async () => {
            setIsSubmitting(true);
            setError(null);
            const failure = await submit(reason);
            setIsSubmitting(false);
            if (failure) setError(failure);
            else setDidSubmit(true);
          }}
        >
          {isSubmitting ? "Submitting…" : "Submit report"}
        </DsButton>
      </div>
    </DialogFrame>
  );
}
