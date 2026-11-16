import { useState } from "react";
import { DsButton, DsCard } from "../ds/Blocks";
import { forgetTopicNotes } from "@/lib/call-recap-api";

/**
 * Settings, for every learner (free or Pro): the topic labels recorded after a call ("past tense", no sentences) can be
 * deleted here. Pro learners also have Forget everything on What Alphonso remembers; this one touches only the labels.
 */
export function TopicNotesSetting() {
  const [state, setState] = useState<"idle" | "asking" | "busy" | "done" | "failed">("idle");
  return (
    <DsCard>
      <h3 className="ds-type-headline text-ds-ink">Mistake topics</h3>
      <p className="ds-type-footnote text-ds-ink-soft">
        After a call, Alphonso notes the kind of mistake you made, for example "past tense". No
        sentences are kept in these notes. You can delete them any time. Your lessons, stars, streak
        and XP stay.
      </p>
      {state === "asking" || state === "busy" ? (
        <div className="grid gap-2">
          <p className="ds-type-footnote font-bold text-ds-ink">
            Delete all your mistake topics? This cannot be undone.
          </p>
          <DsButton
            variant="danger"
            full
            disabled={state === "busy"}
            onClick={() => {
              setState("busy");
              void forgetTopicNotes().then((ok) => setState(ok ? "done" : "failed"));
            }}
          >
            Delete mistake topics
          </DsButton>
          <DsButton variant="secondary" full onClick={() => setState("idle")}>
            Keep them
          </DsButton>
        </div>
      ) : (
        <DsButton variant="secondary" full onClick={() => setState("asking")}>
          Delete mistake topics
        </DsButton>
      )}
      {state === "done" && (
        <p role="status" className="ds-type-footnote text-ds-right-ink">
          Deleted.
        </p>
      )}
      {state === "failed" && (
        <p role="alert" className="ds-type-footnote text-ds-wrong-ink">
          Could not delete them. Try again.
        </p>
      )}
    </DsCard>
  );
}
