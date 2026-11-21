import type { StaffUserHit } from "../../../lib/staff-users.functions";
import type { LearnerFacts } from "../../../lib/staff-user-facts.server";

export type UserHit = StaffUserHit;

/**
 * Everything the Users screen calls, as one object the route fills with the real server functions. The screen never
 * imports a server function itself, so a test hands it fakes and watches exactly what it asks for. Each call is gated
 * on the server by its own requireStaff(scope) and asks for its own reason there; a button hidden in the UI is
 * courtesy, never the control.
 */
export type UsersApi = {
  /** Exact email or id, or the start of a display name. Never a list of everyone. */
  search: (q: string) => Promise<UserHit[]>;
  /** One learner's facts. Opening a learner is recorded (user.view) before anything comes back. */
  getUser: (id: string) => Promise<LearnerFacts>;
  addNote: (id: string, body: string) => Promise<unknown>;
  grantPro: (id: string, days: number, reason: string) => Promise<unknown>;
  revokePro: (id: string, reason: string) => Promise<unknown>;
  block: (id: string, reason: string) => Promise<unknown>;
  unblock: (id: string, reason: string) => Promise<unknown>;
  ban: (id: string, reason: string, confirmEmail: string) => Promise<unknown>;
  unban: (id: string, reason: string) => Promise<unknown>;
  deleteUser: (id: string, reason: string, confirmEmail: string) => Promise<unknown>;
};
