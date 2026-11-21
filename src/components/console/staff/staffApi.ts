import type { StaffMember } from "../../../lib/staff-admin.functions";
import type { Scope } from "../../../lib/staff-scopes";

export type StaffRow = StaffMember;

/**
 * Everything the Staff screen calls, as one object the route fills with the real server functions. The screen never
 * imports a server function itself, so a test hands it fakes and watches exactly what it asks for. Every call is gated
 * on the server (staff.manage AND an owner); a hidden button is courtesy, never the control. Every change carries the
 * reason the person typed, and the server refuses a change without one.
 */
export type StaffApi = {
  list: () => Promise<StaffRow[]>;
  /** Someone who already has an account, found by exact email. */
  add: (input: {
    email: string;
    role: "owner" | "support";
    scopes?: Scope[];
    reason: string;
  }) => Promise<unknown>;
  /** Role, scopes and/or suspended. Anything left out is left as it is. */
  update: (input: {
    userId: string;
    role?: "owner" | "support";
    scopes?: Scope[];
    disabled?: boolean;
    reason: string;
  }) => Promise<unknown>;
};
