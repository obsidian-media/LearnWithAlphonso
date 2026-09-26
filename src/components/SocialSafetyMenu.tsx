import { useRef, useState } from "react";
import { blockUser, reportUser } from "../lib/social-safety.functions";

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "fake_account", label: "Fake account" },
  { value: "other", label: "Something else" },
] as const;

/**
 * The "..." Block/Report menu -- shared by league.tsx and
 * profile_.friends.tsx, the two web surfaces that actually render another
 * user's display name. duels.tsx does not: its UI shows "Challenge from a
 * friend", "You"/"Them", and win/loss by course, with no name anywhere
 * (getMyDuels' own response has no display-name field at all) -- so
 * there is no identity surface there to attach this to today. Kept as one
 * component rather than duplicated per route, same reasoning as the iOS
 * version's own doc comment: the report flow is genuinely identical
 * everywhere it appears, so duplicating it would just be drift waiting to
 * happen.
 */
export function SocialSafetyMenu({
  userId,
  displayName,
  onBlocked,
}: {
  userId: string;
  displayName: string;
  onBlocked?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"block" | "report" | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`More options for ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className="grid size-7 shrink-0 place-items-center rounded-full text-ink-soft/70 hover:bg-parchment"
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
            className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-hairline bg-surface shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setDialog("block");
              }}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-parchment"
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
              className="block w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-parchment"
            >
              Report user
            </button>
          </div>
        </>
      )}

      {dialog === "block" && (
        <BlockConfirmDialog
          displayName={displayName}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            await blockUser({ data: { userId } });
            setDialog(null);
            onBlocked?.();
          }}
        />
      )}

      {dialog === "report" && (
        <ReportDialog displayName={displayName} userId={userId} onClose={() => setDialog(null)} />
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
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-soft/70 hover:text-ink"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BlockConfirmDialog({
  displayName,
  onCancel,
  onConfirm,
}: {
  displayName: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  return (
    <DialogFrame title={`Block ${displayName}?`} onClose={onCancel}>
      <p className="mb-4 text-sm text-ink-soft">
        {displayName} won't be able to add you as a friend or challenge you to a duel, and you won't
        see them in friends, activity, or leaderboards. Contact report@alphonsoecosystem.app if you
        need help with this.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={async () => {
            setIsSubmitting(true);
            await onConfirm();
          }}
          className="rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? "Blocking…" : "Block"}
        </button>
      </div>
    </DialogFrame>
  );
}

function ReportDialog({
  displayName,
  userId,
  onClose,
}: {
  displayName: string;
  userId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]["value"]>("spam");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [didSubmit, setDidSubmit] = useState(false);

  if (didSubmit) {
    return (
      <DialogFrame title="Report submitted" onClose={onClose}>
        <p className="text-sm text-ink-soft">
          Thanks for letting us know. Our team reviews every report. If you need to follow up,
          contact report@alphonsoecosystem.app.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white"
          >
            Done
          </button>
        </div>
      </DialogFrame>
    );
  }

  return (
    <DialogFrame title={`Report ${displayName}`} onClose={onClose}>
      <fieldset className="mb-4 space-y-1.5">
        <legend className="sr-only">Why are you reporting this person?</legend>
        {REPORT_REASONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-parchment"
          >
            <input
              type="radio"
              name="report-reason"
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
              className="accent-moss"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={async () => {
            setIsSubmitting(true);
            await reportUser({ data: { userId, reason } });
            setIsSubmitting(false);
            setDidSubmit(true);
          }}
          className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? "Submitting…" : "Submit report"}
        </button>
      </div>
    </DialogFrame>
  );
}
