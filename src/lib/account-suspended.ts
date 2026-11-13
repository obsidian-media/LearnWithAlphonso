import { create } from "zustand";

/** What the API answers a banned learner's still-valid token (ACCOUNT_SUSPENDED_MESSAGE in auth-middleware.ts). */
export const ACCOUNT_SUSPENDED = "account_suspended";

export const SUSPENDED_TITLE = "This account is suspended.";
export const SUSPENDED_BODY = (supportEmail: string) =>
  `If you think this is a mistake, contact support at ${supportEmail}.`;

/**
 * True for the API's `account_suspended` answer and for Supabase's banned sign-in error (code `user_banned`,
 * message "User is banned"), whether it arrives as an Error or a plain object.
 */
export function isAccountSuspendedError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const { message, code } = error as { message?: unknown; code?: unknown };
  if (code === "user_banned") return true;
  if (typeof message !== "string") return false;
  return message.includes(ACCOUNT_SUSPENDED) || /user is banned/i.test(message);
}

type AccountStatus = { suspended: boolean; setSuspended: () => void; clear: () => void };

export const useAccountStatus = create<AccountStatus>((set) => ({
  suspended: false,
  setSuspended: () => set({ suspended: true }),
  clear: () => set({ suspended: false }),
}));
