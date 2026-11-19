/**
 * The AI cost settings, all from the environment with defaults, pure so they are tested. Documented in
 * docs/operations.md ("AI cost tracking").
 *
 *   AI_COST_ALERT_DAILY_TOTAL_USD  email the owner when yesterday's estimated spend, all learners, reached this (default 25)
 *   AI_COST_ALERT_DAILY_USER_USD   ... or when any one learner's spend for yesterday reached this (default 1.5)
 *   AI_SPEND_BREAKER_DAILY_USD     the circuit breaker: when TODAY's estimated spend, all learners, reaches this, the "ai"
 *                                  switch is turned off and the owner is emailed once (default 100, four times the alert)
 *   AI_SPEND_BREAKER_ENABLED       "false" turns the breaker off; anything else leaves it on
 *   AI_COST_USD_PER_CAD            exchange rate for the heavy-learner line (default 0.72; an estimate, set it to today's)
 *   AI_COST_HEAVY_PRICE_CAD        the monthly price the line is drawn from (default 12.99)
 *   AI_COST_HEAVY_SHARE            the share of that price a learner's AI may cost before they count as heavy (default 0.85)
 *
 * The heavy line is therefore 12.99 CAD x 85% x 0.72 = about 7.95 USD a month by default, labelled an estimate.
 */
export const COST_DEFAULTS = {
  dailyTotalUsd: 25,
  dailyUserUsd: 1.5,
  breakerDailyUsd: 100,
  usdPerCad: 0.72,
  heavyPriceCad: 12.99,
  heavyShare: 0.85,
} as const;

export type CostConfig = {
  dailyTotalUsd: number;
  dailyUserUsd: number;
  /** Today's total at which the breaker switches AI off. */
  breakerDailyUsd: number;
  breakerEnabled: boolean;
  usdPerCad: number;
  heavyPriceCad: number;
  heavyShare: number;
  /** heavyPriceCad x heavyShare x usdPerCad. */
  heavyMonthlyUsd: number;
};

const positive = (raw: string | undefined, fallback: number): number => {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function costConfig(env: Record<string, string | undefined>): CostConfig {
  const dailyTotalUsd = positive(env.AI_COST_ALERT_DAILY_TOTAL_USD, COST_DEFAULTS.dailyTotalUsd);
  const dailyUserUsd = positive(env.AI_COST_ALERT_DAILY_USER_USD, COST_DEFAULTS.dailyUserUsd);
  const breakerDailyUsd = positive(env.AI_SPEND_BREAKER_DAILY_USD, COST_DEFAULTS.breakerDailyUsd);
  const usdPerCad = positive(env.AI_COST_USD_PER_CAD, COST_DEFAULTS.usdPerCad);
  const heavyPriceCad = positive(env.AI_COST_HEAVY_PRICE_CAD, COST_DEFAULTS.heavyPriceCad);
  const heavyShare = Math.min(positive(env.AI_COST_HEAVY_SHARE, COST_DEFAULTS.heavyShare), 1);
  return {
    dailyTotalUsd,
    dailyUserUsd,
    breakerDailyUsd,
    breakerEnabled: (env.AI_SPEND_BREAKER_ENABLED ?? "").trim().toLowerCase() !== "false",
    usdPerCad,
    heavyPriceCad,
    heavyShare,
    heavyMonthlyUsd: heavyPriceCad * heavyShare * usdPerCad,
  };
}
