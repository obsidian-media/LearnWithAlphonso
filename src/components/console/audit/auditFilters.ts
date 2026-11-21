import { AUDIT_CATEGORIES } from "../../../lib/audit-labels";
import type { AuditFilters } from "./auditApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The draft of every control. Text commits on Search or Enter; the selects and dates apply as soon as they change. */
export type Draft = { actor: string; category: string; text: string; from: string; to: string };
export const EMPTY: Draft = { actor: "", category: "", text: "", from: "", to: "" };

/** What the server is sent for a draft. A pasted learner id searches that learner; any other text searches reasons. */
export function filtersFor(d: Draft): AuditFilters {
  const out: AuditFilters = {};
  if (d.actor) out.actor = d.actor;
  const cat = AUDIT_CATEGORIES.find((c) => c.key === d.category);
  if (cat) out.actions = [...cat.prefixes];
  const text = d.text.trim();
  if (text) {
    if (UUID.test(text)) out.target = text;
    else out.q = text;
  }
  if (d.from) out.from = new Date(`${d.from}T00:00:00Z`).toISOString();
  if (d.to) out.to = new Date(`${d.to}T23:59:59Z`).toISOString();
  return out;
}
