package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.ReferralClaimReason
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralClaimResult
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralRow
import io.ktor.http.HttpMethod
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * `claim_referral` (SECURITY DEFINER): the caller is the database's auth.uid(); self-referral, a second referral and a
 * retroactive claim (account over 2 days old, or a completed lesson) are refused there. Never throws, except a
 * cancellation: a failed call or an answer that cannot be read is [ReferralClaimResult.Error]. Port of
 * ProgressSyncClient.claimReferral in Swift.
 */
suspend fun ProgressSyncClient.claimReferral(code: String): ReferralClaimResult = try {
    val row = rowsOf(http.rpc("claim_referral", buildJsonObject { put("_code", code) })).firstOrNull()
    val ok = row?.bool("ok")
    when {
        row == null || ok == null -> ReferralClaimResult.Error
        ok == true -> ReferralClaimResult.Claimed
        else -> ReferralClaimReason.fromRaw(row.string("reason"))?.let { ReferralClaimResult.Refused(it) } ?: ReferralClaimResult.Error
    }
} catch (e: CancellationException) {
    throw e
} catch (_: Exception) {
    ReferralClaimResult.Error
}

/** The learner's own referrals as referrer (RLS also shows rows where they are the referee, so the filter is needed). */
suspend fun ProgressSyncClient.fetchReferralRows(referrerId: String): List<ReferralRow> =
    rowsOf(
        http.rest(
            HttpMethod.Get, "referrals",
            mapOf("select" to "status,capped,completed_at", "referrer_id" to "eq.$referrerId"),
        ),
    ).mapNotNull { row ->
        val status = row.string("status") ?: return@mapNotNull null
        ReferralRow(
            status = status,
            capped = row.bool("capped") ?: false,
            completedAtMillis = row.string("completed_at")?.let { ProgressSyncClient.parsePostgresTimestampMillis(it) }?.toLong(),
        )
    }
