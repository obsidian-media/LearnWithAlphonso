import type { AuditActor, AuditRow } from "../../../lib/staff-audit.functions";

export type { AuditActor, AuditRow };

/** What the filters send. Everything is optional; the server checks each part again. */
export type AuditFilters = {
  /** One staff person (user id). */
  actor?: string;
  /** One learner (user id). */
  target?: string;
  /** Action prefixes of the chosen category ("user.", "report."). */
  actions?: string[];
  /** A piece of the reason; wildcards in it are literal on the server. */
  q?: string;
  /** ISO instants, inclusive. */
  from?: string;
  to?: string;
};

export type AuditPage = { rows: AuditRow[]; nextCursor: number | null };

/**
 * Everything the Audit screen calls, as one object the route fills with the real server functions. The screen never
 * imports a server function itself, so a test hands it fakes and watches exactly what it asks for. Both calls are gated
 * on the server (audit.read); a hidden screen is courtesy, never the control.
 */
export type AuditApi = {
  list: (filters: AuditFilters, cursor?: number) => Promise<AuditPage>;
  /** The staff who appear in the record, for the Actor filter. */
  actors: () => Promise<AuditActor[]>;
};
