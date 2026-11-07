import { CAMPAIGNS } from "../data/campaigns";
import type { ReplyVerdict } from "./chat-verdict";
import { practiceItemForPrompt } from "./practice-catalog";
import { recordSkillResults } from "./profile-data.server";
import { STAR_RULE, measureReply, starsForCall } from "./practice-stars";

/**
 * The server half of Practice stars (migration 20261107032021_practice_stars.sql). Both writes run as the service
 * role through SECURITY DEFINER functions that no client may execute; the client only names its call.
 */
type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCallId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/**
 * Records one judged learner reply for a call (called by /api/chat once the model's verdict is known). The item is
 * the one the whitelisted system prompt belongs to; the words are measured from the text the learner sent. Returns
 * false when nothing was recorded (no call id, an unknown prompt, a refused call). Never throws: a recording failure
 * must never cost the learner the reply itself.
 */
export async function recordPracticeReply(
  /** The service-role client. Typed loosely: the function is not in types.ts until the types are regenerated. */
  client: object,
  params: {
    userId: string;
    callId: unknown;
    systemPrompt: string;
    learnerText: string;
    verdict: ReplyVerdict;
  },
): Promise<boolean> {
  if (!isCallId(params.callId)) return false;
  const item = practiceItemForPrompt(params.systemPrompt);
  if (!item) return false;
  const m = measureReply(params.learnerText, item.course);
  const admin = client as Rpc;
  try {
    const { error } = await admin.rpc("record_practice_reply", {
      _user_id: params.userId,
      _call_id: params.callId,
      _course: item.course,
      _kind: item.kind,
      _item_key: item.key,
      _right: params.verdict === "correct",
      _short: m.short,
      _english: m.english,
    });
    if (!error) {
      // Practice replies are the speaking skill: right when the model judged it correct, wrong when it corrected
      // it, nothing when it could not tell (greeting, question). Counted only for a reply recorded in a real call.
      if (params.verdict !== "none") {
        await recordSkillResults(client, params.userId, [
          { skill: "speaking", right: params.verdict === "correct" ? 1 : 0, total: 1 },
        ]);
      }
      return true;
    }
  } catch {
    // fall through
  }
  console.warn(JSON.stringify({ event: "practice_reply_not_recorded" }));
  return false;
}

/** A practice_calls row as stored (snake case, as PostgREST returns it). */
export type CallRow = {
  id: string;
  user_id: string;
  course: string;
  kind: "scenario" | "scene";
  item_key: string;
  replies: number;
  right_replies: number;
  short_replies: number;
  english_replies: number;
  started_at: string;
  last_reply_at: string;
  finished_at: string | null;
};

/** Replies that finish a stored call: the scenario rule, or the scene's own minTurns; null for an unknown item. */
export function finishMinReplies(kind: string, itemKey: string): number | null {
  if (kind === "scenario") return STAR_RULE.scenarioFinishMinReplies;
  const [campaignId, sceneId] = itemKey.split("/");
  const scene = CAMPAIGNS.find((c) => c.id === campaignId)?.scenes.find((s) => s.id === sceneId);
  return scene ? scene.minTurns : null;
}

/** Stars for a stored call, from its server-recorded tally only. An item no longer in the catalog earns none. */
export function starsForRow(row: CallRow): 0 | 1 | 2 | 3 {
  const min = finishMinReplies(row.kind, row.item_key);
  if (min === null) return 0;
  return starsForCall(
    {
      replies: row.replies,
      rightReplies: row.right_replies,
      shortReplies: row.short_replies,
      englishReplies: row.english_replies,
    },
    min,
  );
}
