import { createMiddleware } from "@tanstack/react-start";
import { isAccountSuspendedError, useAccountStatus } from "./account-suspended";

/**
 * Registered as a global functionMiddleware (src/start.ts): when any server call comes back `account_suspended`,
 * the app swaps to the suspended screen instead of showing a generic error.
 */
export const watchAccountSuspended = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (isAccountSuspendedError(error)) useAccountStatus.getState().setSuspended();
      throw error;
    }
  },
);
