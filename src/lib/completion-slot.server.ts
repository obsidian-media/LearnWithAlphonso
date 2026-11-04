import { HOURLY_COMPLETION_LIMIT } from "./anti-farming";

/**
 * Records one completion against the learner's rolling-hour ceiling (consume_lesson_completion_slot). false means the
 * learner is over it. A database error fails OPEN: the guard must never stop a real lesson from saving.
 */
export async function consumeCompletionSlot(userId: string, atIso: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_lesson_completion_slot", {
    _user_id: userId,
    _at: atIso,
    _limit: HOURLY_COMPLETION_LIMIT,
  });
  if (error) {
    console.log(
      JSON.stringify({ event: "completion_slot_unavailable", fn: "completeLessonRemote" }),
    );
    return true;
  }
  return data !== false;
}
