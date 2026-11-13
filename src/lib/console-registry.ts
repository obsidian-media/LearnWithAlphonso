import { ADMIN_FUNCTION_NAMES } from "./admin.functions";

/**
 * The registry of EVERY console server function, by file. admin.functions.ts keeps its own ADMIN_FUNCTION_NAMES (its
 * count test stays as it was); the staff files are listed here. staff-registry.test.ts fails when a file or a function
 * is missing from this list, in both directions, so a console endpoint cannot be added without being counted, gated
 * with requireStaff(...) and, for a write, recorded.
 */
export const CONSOLE_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  "admin.functions.ts": ADMIN_FUNCTION_NAMES,
  "staff-users.functions.ts": [
    "staffSearchUsers",
    "staffGetUser",
    "staffAddNote",
    "staffGrantPro",
    "staffRevokePro",
    "staffBlockUser",
    "staffUnblockUser",
    "staffBanUser",
    "staffUnbanUser",
    "staffDeleteUser",
  ],
  "staff-admin.functions.ts": ["staffListStaff", "staffAddStaff", "staffUpdateStaff"],
  "staff-audit.functions.ts": ["staffListAudit"],
};

/** The staff functions that only read. Every other staff function is in STAFF_WRITE_FUNCTIONS (staff-audit.server.ts). */
export const STAFF_READ_FUNCTIONS = [
  "staffSearchUsers",
  "staffGetUser",
  "staffListStaff",
  "staffListAudit",
] as const;
