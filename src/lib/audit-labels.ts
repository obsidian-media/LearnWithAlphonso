/**
 * The action record's codes as short sentences for the Home feed. TOTAL: a code with no sentence is shown as the raw
 * code, never hidden, so a new action can never vanish from the feed.
 */
const SENTENCES: Record<string, string> = {
  "pro.grant": "gave a learner Pro",
  "pro.grant.failed": "tried to give a learner Pro (it failed)",
  "pro.revoke": "ended a learner's gifted Pro",
  "pro.revoke.failed": "tried to end a learner's gifted Pro (it failed)",
  "user.block": "blocked a learner's social features",
  "user.unblock": "lifted a block",
  "user.ban": "banned a learner",
  "user.ban.partial": "banned a learner (finished in part)",
  "user.unban": "lifted a ban",
  "user.unban.partial": "lifted a ban (finished in part)",
  "user.delete": "deleted an account",
  "user.delete.requested": "started deleting an account",
  "user.delete.completed": "deleted an account",
  "user.delete.failed": "tried to delete an account (it failed)",
  "user.delete.refused": "was refused deleting an account",
  "user.note": "added a note on a learner",
  "report.dismiss": "dismissed a report",
  "report.reset_display_name": "reset a learner's display name",
  "report.rename_team": "renamed a team",
  "report.disband_team": "disbanded a team",
  "staff.add": "added a staff member",
  "staff.update": "changed a staff member",
  "support.reply": "replied to a ticket",
  "support.assign": "assigned a ticket",
  "support.status": "changed a ticket's status",
  "support.note": "added an internal note to a ticket",
  "support.handoff": "handed a ticket to an owner",
  "support.urgent_clear": "cleared a ticket's urgent flag",
  "settings.update": "changed a console setting",
  "podcast.folder.create": "created a podcast folder",
  "podcast.folder.rename": "renamed a podcast folder",
  "podcast.folder.move": "moved a podcast folder",
  "podcast.folder.delete": "deleted a podcast folder",
  "podcast.episode.create": "added a podcast episode",
  "podcast.episode.update": "edited a podcast episode",
  "podcast.episode.publish": "published a podcast episode",
  "podcast.episode.unpublish": "unlisted a podcast episode",
  "podcast.episode.audio_replace": "replaced an episode's audio",
  "podcast.transcript.save": "saved a transcript",
  "podcast.transcript.delete": "deleted a transcript",
};

export function auditSentence(action: string): string {
  return SENTENCES[action] ?? action;
}

/** The dot colour for a feed row: destructive actions read as warnings. */
export function auditTone(action: string): "bad" | "warn" | "info" {
  if (/^user\.(ban|delete)/.test(action) || action.endsWith(".failed")) return "bad";
  if (/^user\.block|^report\.|^pro\.revoke|^staff\.|^settings\./.test(action)) return "warn";
  return "info";
}
