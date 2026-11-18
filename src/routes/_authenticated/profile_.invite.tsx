import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BackPill, DsButton, DsCard, GlassTitle, Icon, Overline } from "@/components/ds/Blocks";
import { DsScreen } from "@/components/ds/DsScreen";
import { getReferralOverview } from "../../lib/referral.functions";
import {
  REFERRAL_COPY,
  REFERRAL_MONTHLY_CAP,
  capReached,
  referralCountLine,
  referralLink,
  rewardsLeft,
} from "../../lib/referral";

export const Route = createFileRoute("/_authenticated/profile_/invite")({
  component: InvitePage,
  head: () => ({
    meta: [
      { title: "Invite friends — Alphonso" },
      {
        name: "description",
        content: "Share your link. When a friend finishes a first lesson, you both get a reward.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function InvitePage() {
  const overview = useQuery({
    queryKey: ["referralOverview"],
    queryFn: () => getReferralOverview(),
    retry: false,
  });
  const [copied, setCopied] = useState(false);
  const code = overview.data?.code ?? null;
  const summary = overview.data?.summary ?? null;
  const link = code ? referralLink(window.location.origin, code) : null;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the link is still shown to copy by hand
    }
  }

  async function share() {
    if (!link) return;
    try {
      await navigator.share({
        title: REFERRAL_COPY.title,
        text: REFERRAL_COPY.shareText,
        url: link,
      });
    } catch {
      // the learner closed the share sheet
    }
  }

  const failed = overview.isError || (overview.isSuccess && !code);

  return (
    <DsScreen scene="practice">
      <BackPill to="/profile" label="Back to profile">
        Profile
      </BackPill>
      <GlassTitle title={REFERRAL_COPY.title} sub={null} />

      <DsCard>
        <div className="flex items-center gap-3">
          <Icon name="handshake" size={52} />
          <div className="min-w-0 flex-1">
            <p className="ds-type-headline text-ds-ink">Both of you get a reward</p>
            <p className="ds-type-footnote text-ds-ink-soft">{REFERRAL_COPY.explainer}</p>
          </div>
        </div>
        <p className="ds-type-caption text-ds-ink-faint">{REFERRAL_COPY.proNote}</p>
      </DsCard>

      <DsCard>
        <Overline>Your link</Overline>
        {overview.isLoading ? (
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        ) : failed ? (
          <div role="alert" className="grid gap-2">
            <p className="ds-type-footnote text-ds-ink-soft">{REFERRAL_COPY.loadError}</p>
            <DsButton small variant="secondary" onClick={() => void overview.refetch()}>
              Try again
            </DsButton>
          </div>
        ) : (
          <>
            <p
              data-referral-link=""
              className="break-all rounded-[12px] bg-ds-sunk px-3 py-2 ds-type-footnote text-ds-ink"
            >
              {link}
            </p>
            <div className="flex gap-2">
              <DsButton full onClick={() => void copy()} disabled={!link}>
                {copied ? REFERRAL_COPY.copied : REFERRAL_COPY.copy}
              </DsButton>
              {canShare ? (
                <DsButton full variant="secondary" onClick={() => void share()} disabled={!link}>
                  {REFERRAL_COPY.share}
                </DsButton>
              ) : null}
            </div>
            <span role="status" aria-live="polite" className="sr-only">
              {copied ? "Link copied to clipboard" : ""}
            </span>
          </>
        )}
      </DsCard>

      {summary ? (
        <DsCard>
          <Overline>Your invites</Overline>
          <p data-referral-count="" className="ds-type-headline text-ds-ink">
            {summary.completed}
          </p>
          <p className="ds-type-footnote text-ds-ink-soft">{referralCountLine(summary)}</p>
          {capReached(summary) ? (
            <p
              role="status"
              data-referral-cap=""
              className="ds-type-footnote font-bold text-ds-ink"
            >
              {REFERRAL_COPY.capReached}
            </p>
          ) : (
            <p className="ds-type-caption text-ds-ink-faint">
              {rewardsLeft(summary)} of {REFERRAL_MONTHLY_CAP} rewards left this month.
            </p>
          )}
        </DsCard>
      ) : null}
    </DsScreen>
  );
}
