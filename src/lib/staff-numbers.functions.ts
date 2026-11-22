import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "./staff-middleware";
import { consumeStaffLimit, STAFF_LIMITS } from "./staff-rate-limit";
import { parseWindow, type NumbersResponse } from "./numbers-core";

export type { NumbersResponse, NumbersGroup, Tile } from "./numbers-core";

/**
 * The numbers dashboard's one server function. Gated by requireStaff() (any active staff member, second factor), then
 * collectNumbers decides per group: the own-database, Sentry and PostHog groups need numbers.read; RevenueCat, the AI
 * cost estimate, the App Store and Google Play need numbers.revenue. A person with neither scope is refused; a person
 * with one scope never receives (nor does the server even fetch) the other scope's groups. Reads only, no personal
 * data in the answer, no entry in the action record (nothing about a learner is opened).
 */

export const TOO_MANY_NUMBERS = "Too many requests. Wait a minute and try again.";

export const staffGetNumbers = createServerFn({ method: "POST" })
  .middleware([requireStaff()])
  .inputValidator((d: unknown) =>
    z
      .object({
        window: z
          .number()
          .refine((n) => parseWindow(n) !== null, "Choose today, 7, 30 or 90 days."),
        refresh: z.boolean().optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<NumbersResponse> => {
    if (!(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.numbers)))
      throw new Error(TOO_MANY_NUMBERS);
    if (
      data.refresh &&
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.numbersRefresh))
    )
      throw new Error(TOO_MANY_NUMBERS);
    const { collectNumbers } = await import("./numbers-core");
    const { createSources, createOwnFetcher, createGrowthFetcher } =
      await import("./numbers-sources.server");
    return collectNumbers({
      scopes: context.staffScopes,
      windowDays: data.window,
      refresh: data.refresh,
      sources: createSources(process.env),
      fetchOwn: createOwnFetcher(),
      fetchGrowth: createGrowthFetcher(),
    });
  });
