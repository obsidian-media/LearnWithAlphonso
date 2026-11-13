package com.obsidianmedia.learnwithalphonso.core.logic

import java.time.Instant
import java.time.ZoneOffset

/**
 * The learner's daily Hector allowance (BACKLOG 0.0-bq #5), read before Hector greets so a learner who has used it
 * up sees the "out for today" message instead of one more cached greeting.
 *
 * There is no status endpoint: `consume_ai_quota` keeps one `ai_usage` row per user, day and kind, and the learner may
 * read their own rows. The day is the UTC date (the function keys on `current_date` on a UTC database), and the call
 * that would take the count past the limit is the one refused, so the allowance is used up once the count has reached
 * it. Fails open: a failed read leaves the greeting as before, because the server still refuses the turn.
 *
 * Port of src/lib/hector-allowance.ts and HectorAllowance.swift; keep the three in step.
 */
object HectorAllowance {
    /** Pro learners' Hector turns per day; the real cap is in consume_ai_quota (20261102120000). */
    const val DAILY_LIMIT = 150

    /** The words the server's own quota refusal shows (AiErrorCopy.quotaExceededMessage carries the same). */
    const val OUT_FOR_TODAY = "You've reached today's AI practice limit. Try again tomorrow."

    /** consume_ai_quota keys on the UTC date. */
    fun utcDay(nowMillis: Long): String = Instant.ofEpochMilli(nowMillis).atZone(ZoneOffset.UTC).toLocalDate().toString()

    /** True when any of today's counts has reached the limit; no row never locks the learner out. */
    fun isUsedUp(counts: List<Int>, limit: Int = DAILY_LIMIT): Boolean = counts.any { it >= limit }
}
