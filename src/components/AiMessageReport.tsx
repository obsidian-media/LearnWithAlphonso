import { useState } from "react";
import { AI_CONSENT_COPY, AI_REPORT_REASONS, type AiReportReason } from "@/lib/ai-consent-copy";
import { capReportMessage } from "@/lib/ai-report-budget";
import { Modal } from "./Modal";
import { reportAiResponse } from "@/lib/social-safety.functions";

type ReportInput = {
  reason: AiReportReason;
  context: {
    message: string;
    surface: "hector" | "conversation" | "campaign";
    course: "en" | "fr" | "es";
    scenario_id?: string;
    campaign_id?: string;
    scene_index?: number;
  };
};

/** A "Report this response" button and sheet for one AI message. */
export function AiMessageReport({
  message,
  surface,
  course,
  scenarioId,
  campaignId,
  sceneIndex,
  send = (input: ReportInput) => reportAiResponse({ data: input }),
}: {
  message: string;
  surface: ReportInput["context"]["surface"];
  course: ReportInput["context"]["course"];
  scenarioId?: string;
  campaignId?: string;
  sceneIndex?: number;
  send?: (input: ReportInput) => Promise<{ ok: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AiReportReason>("ai_inappropriate");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  function close() {
    setOpen(false);
    setStatus("idle");
  }

  async function submit() {
    setStatus("sending");
    try {
      const { ok } = await send({
        reason,
        context: {
          // Cut by code point and by the database's byte budget, so the report can never fail the size check.
          message: capReportMessage(message, { course, scenarioId, campaignId }),
          surface,
          course,
          ...(scenarioId ? { scenario_id: scenarioId } : {}),
          ...(campaignId ? { campaign_id: campaignId } : {}),
          ...(sceneIndex !== undefined ? { scene_index: sceneIndex } : {}),
        },
      });
      setStatus(ok ? "sent" : "failed");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={AI_CONSENT_COPY.reportAction}
        onClick={() => setOpen(true)}
        className="mt-1 text-[11px] text-ink-soft/70 underline"
      >
        Report
      </button>
      {open && (
        <Modal
          labelledBy="ai-report-title"
          describedBy="ai-report-note"
          onEscape={close}
          className="relative w-full max-w-md rounded-t-3xl bg-surface p-6 outline-none sm:rounded-3xl"
        >
          <div>
            <h2 id="ai-report-title" className="font-display text-[18px] font-semibold text-ink">
              {AI_CONSENT_COPY.reportAction}
            </h2>
            {status === "sent" ? (
              <p role="status" className="mt-3 text-sm text-ink">
                {AI_CONSENT_COPY.reportThanks}
              </p>
            ) : (
              <>
                <p id="ai-report-note" className="mt-2 text-xs text-ink-soft">
                  {AI_CONSENT_COPY.reportReviewNote}
                </p>
                <fieldset className="mt-3 space-y-2">
                  {AI_REPORT_REASONS.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="radio"
                        name="ai-report-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                      />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
                {status === "failed" && (
                  <p role="alert" className="mt-2 text-xs text-rose-700">
                    {AI_CONSENT_COPY.reportFailed}
                  </p>
                )}
                <button
                  type="button"
                  disabled={status === "sending"}
                  onClick={() => void submit()}
                  className="mt-4 w-full rounded-2xl bg-moss px-4 py-3 font-semibold text-surface disabled:opacity-60"
                >
                  Send report
                </button>
              </>
            )}
            <button
              type="button"
              onClick={close}
              className="mt-2 w-full px-4 py-2 text-sm text-ink-soft"
            >
              {status === "sent" ? "Done" : "Cancel"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
