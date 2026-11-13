import { Button } from "../ui/Button";
import { ACTION_LABEL, allowedActions, type UserAction } from "../../lib/staff-actions";
import type { LearnerFacts } from "../../lib/staff-user-facts.server";

/**
 * The action buttons on the learner page: only the ones the viewer's scopes allow. The server checks each action's
 * scope again, so this is courtesy, not control.
 */
export function UserActionButtons({
  scopes,
  facts,
  onAction,
}: {
  scopes: readonly string[];
  facts: Pick<LearnerFacts, "pro" | "restrictions">;
  onAction: (action: UserAction) => void;
}) {
  const actions = allowedActions(scopes, facts);
  if (actions.length === 0) {
    return <p className="ds-type-footnote text-ds-ink-soft">No actions are available to you.</p>;
  }
  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => (
        <Button
          key={action}
          variant={action === "delete" || action === "ban" ? "ember" : "secondary"}
          className="!px-4 !py-2 text-sm"
          onClick={() => onAction(action)}
        >
          {ACTION_LABEL[action]}
        </Button>
      ))}
    </div>
  );
}
