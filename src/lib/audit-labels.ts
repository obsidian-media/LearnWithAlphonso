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
  "user.rehearsals_off": "switched rehearsals off for a learner",
  "user.rehearsals_on": "switched rehearsals back on for a learner",
  "user.delete.requested": "started deleting an account",
  "user.delete.completed": "deleted an account",
  "user.delete.failed": "tried to delete an account (it failed)",
  "user.delete.refused": "was refused deleting an account",
  "note.add": "added a note on a learner",
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

/* ------------------------------------------------------------------------------------------------------------------
 * The Action record screen (/audit). Same rule as above (total, never hidden), with a short verb phrase per code that is
 * followed by the person it was done to ("Banned" + a name), an icon tone, and the filter categories. audit-labels.test.ts
 * reads the migrations and the server code for every action literal and fails when one has no entry in EITHER map here.
 * ---------------------------------------------------------------------------------------------------------------- */

export type AuditTone = "ok" | "info" | "warn" | "bad";

export type ActionLabel = {
  /** What was done, e.g. "Banned". The target's name follows it on the row. */
  text: string;
  tone: AuditTone;
  /** False when the code has no entry: `text` is then the raw code. */
  known: boolean;
};

export type AuditCategory = {
  key: string;
  label: string;
  /** Action prefixes this category covers; each ends in a dot. The server matches an action that starts with one. */
  prefixes: readonly string[];
};

/** The only prefixes the server will filter on (a category is a list of these). */
export const AUDIT_PREFIXES = [
  "user.",
  "note.",
  "pro.",
  "report.",
  "podcast.",
  "staff.",
  "support.",
  "settings.",
] as const;

/** The Action filter. Every prefix here is one of AUDIT_PREFIXES, and every prefix is in exactly one category. */
export const AUDIT_CATEGORIES: readonly AuditCategory[] = [
  { key: "moderation", label: "Moderation", prefixes: ["user.", "note.", "report."] },
  { key: "billing", label: "Billing", prefixes: ["pro."] },
  { key: "support", label: "Support", prefixes: ["support."] },
  { key: "content", label: "Content", prefixes: ["podcast."] },
  { key: "staff", label: "Staff and settings", prefixes: ["staff.", "settings."] },
];

const L = (text: string, tone: AuditTone): { text: string; tone: AuditTone } => ({ text, tone });

export const ACTION_LABELS: Readonly<Record<string, { text: string; tone: AuditTone }>> = {
  "user.view": L("Looked at", "info"),
  "note.add": L("Added a note on", "info"),
  "user.block": L("Restricted", "warn"),
  "user.unblock": L("Lifted the restriction on", "ok"),
  "user.ban": L("Banned", "bad"),
  "user.unban": L("Lifted the ban on", "ok"),
  "user.ban.partial": L("Ban only partly applied for", "bad"),
  "user.unban.partial": L("Ban lift only partly applied for", "warn"),
  "user.delete.requested": L("Started deleting", "warn"),
  "user.delete.completed": L("Finished deleting", "bad"),
  "user.delete.refused": L("Deletion refused for", "warn"),
  "user.delete.failed": L("Deletion failed for", "bad"),
  "user.delete": L("Deleted", "bad"),
  "user.rehearsals_off": L("Switched rehearsals off for", "warn"),
  "user.rehearsals_on": L("Switched rehearsals back on for", "ok"),
  "pro.grant": L("Gave Pro to", "ok"),
  "pro.revoke": L("Took Pro from", "warn"),
  "pro.grant.failed": L("Giving Pro failed for", "bad"),
  "pro.revoke.failed": L("Taking Pro away failed for", "bad"),
  "report.dismiss": L("Dismissed a report", "ok"),
  "report.reset_display_name": L("Reset a display name", "warn"),
  "report.rename_team": L("Renamed a team", "warn"),
  "report.disband_team": L("Disbanded a team", "bad"),
  "support.reply": L("Replied to", "info"),
  "support.assign": L("Assigned a ticket for", "info"),
  "support.status": L("Changed a ticket status for", "info"),
  "support.note": L("Added a ticket note for", "info"),
  "support.handoff": L("Handed a ticket to the owner for", "warn"),
  "support.urgent_clear": L("Cleared the urgent flag for", "ok"),
  "podcast.folder.create": L("Created a podcast folder", "ok"),
  "podcast.folder.rename": L("Renamed a podcast folder", "info"),
  "podcast.folder.move": L("Moved a podcast folder", "info"),
  "podcast.folder.delete": L("Deleted a podcast folder", "bad"),
  "podcast.episode.create": L("Created a podcast episode", "ok"),
  "podcast.episode.update": L("Edited a podcast episode", "info"),
  "podcast.episode.publish": L("Published a podcast episode", "ok"),
  "podcast.episode.unpublish": L("Unpublished a podcast episode", "warn"),
  "podcast.episode.audio_replace": L("Replaced a podcast episode's audio", "info"),
  "podcast.transcript.save": L("Saved a podcast transcript", "info"),
  "podcast.transcript.delete": L("Deleted a podcast transcript", "warn"),
  "staff.add": L("Added staff", "info"),
  "staff.update": L("Changed staff access", "info"),
  "settings.update": L("Changed a setting", "info"),
};

/** Total: any string in, a label out. An unknown code is shown as itself (never hidden, never blank). */
export function humanizeAction(code: string): ActionLabel {
  const hit = Object.hasOwn(ACTION_LABELS, code) ? ACTION_LABELS[code] : undefined;
  if (hit) return { ...hit, known: true };
  return { text: code.trim() === "" ? "(no action recorded)" : code, tone: "info", known: false };
}

/** A short form of an id, for when a name cannot be found (the person is deleted, or never had one). */
export function shortId(id: string | null): string | null {
  return id ? `${id.slice(0, 8)}…` : null;
}
