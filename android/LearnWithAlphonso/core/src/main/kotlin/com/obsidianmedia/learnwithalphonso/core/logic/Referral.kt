package com.obsidianmedia.learnwithalphonso.core.logic

import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.time.ZoneOffset
import java.time.ZonedDateTime

/**
 * The referral program on Android, as pure functions (design: docs/superpowers/specs/2026-11-17-referral-design.md; the
 * rules live in the database, 20261120140000_referral_program.sql). This file holds the numbers the screen shows, how the
 * shareable link is built, how a referral code is read from a link or typed text, how a captured code is kept until the
 * account exists, and the counts. It never decides whether anything is granted: the server does, on a first completed
 * lesson, and the client has no way to ask for a reward.
 *
 * Port of src/lib/referral.ts and Referral.swift; keep the three in step.
 */
object ReferralConstants {
    /** Hearts a referral grants (hearts are hard-capped at 5, so a full refill). Same value as the SQL constant. */
    const val REWARD_HEARTS = 5

    /** Rewarded referrals per referrer per UTC calendar month. Same value as the SQL constant. */
    const val MONTHLY_CAP = 20

    /** Streak freezes a Pro referrer can hold before the freeze reward is skipped. Same value as the SQL constant. */
    const val FREEZE_CAP = 3

    /** A captured code is forgotten after this long if the visitor never signs up. */
    const val KEEP_MS = 30L * 24 * 60 * 60 * 1000
}

object ReferralCopy {
    const val TITLE = "Invite friends"
    const val EXPLAINER =
        "Share your link. When a friend signs up and finishes their first lesson, you both get your hearts back to full. If you have Pro, you get a free streak freeze instead."
    const val PRO_NOTE = "Pro already has unlimited hearts, so you get a streak freeze (up to 3 at a time)."
    const val CAP_REACHED =
        "Monthly invite reward limit reached. Friends can still join, and rewards start again next month."
    const val LOAD_ERROR = "Couldn't load your invites. Try again."
    const val COPY = "Copy invite link"
    const val COPIED = "Link copied!"
    const val SHARE = "Share"
    const val SHARE_TEXT = "Learn with me on Alphonso. English, French and Spanish, one lesson at a time."
    const val ENTER_TITLE = "Got an invite code?"
    const val ENTER_HINT = "If a friend invited you, paste their link or code here. It only works on a new account."
    const val ENTER_FIELD = "Invite link or code"
    const val ENTER_BUTTON = "Use code"
    const val ENTER_DONE = "Invite added. You both get a reward when you finish your first lesson."
    const val CLAIM_ERROR = "Couldn't check that code. Try again."

    /** What the learner is told when a typed code is refused. Every refusal is final; only an error invites a retry. */
    fun refusal(reason: ReferralClaimReason): String = when (reason) {
        ReferralClaimReason.UNAUTHENTICATED -> "Sign in to use an invite code."
        ReferralClaimReason.UNKNOWN_CODE -> "That invite code isn't valid. Check it and try again."
        ReferralClaimReason.SELF -> "That's your own invite code. Send it to a friend instead."
        ReferralClaimReason.ALREADY_REFERRED -> "You've already used an invite code."
        ReferralClaimReason.TOO_LATE -> "Invite codes only work for new accounts, before the first lesson."
    }
}

/** Why `claim_referral` refused. [raw] is the database's word (`reason` in the RPC's answer). */
enum class ReferralClaimReason(val raw: String) {
    UNAUTHENTICATED("unauthenticated"),
    UNKNOWN_CODE("unknown-code"),
    SELF("self"),
    ALREADY_REFERRED("already-referred"),
    TOO_LATE("too-late"),
    ;

    companion object {
        fun fromRaw(raw: String?): ReferralClaimReason? = entries.firstOrNull { it.raw == raw }
    }
}

sealed interface ReferralClaimResult {
    data object Claimed : ReferralClaimResult
    data class Refused(val reason: ReferralClaimReason) : ReferralClaimResult

    /** Anything unexplained (network, an answer that could not be read): the code is kept to retry. */
    data object Error : ReferralClaimResult

    /** Whether the answer ends the attempt: claimed, or refused for a real reason. Only [Error] is retried. */
    val isFinal: Boolean get() = this !is Error
}

object ReferralLink {
    const val HOST = "learnwithalphonso.com"

    /** Links already shared name the previous host; both open the same invite. */
    val ACCEPTED_HOSTS = setOf(HOST, "learn.alphonsoecosystem.app")

    /** An invite code is the opaque token from friend_invite_codes. Anything else is ignored. Same shape as the web's. */
    private val CODE = Regex("^[A-Za-z0-9+/=_-]{4,32}$")

    fun isValid(code: String): Boolean = CODE.matches(code)

    /** The code from a query value (`?ref=...`), or null when absent or not shaped like a code. */
    fun codeFromParam(raw: String?): String? {
        if (raw == null) return null
        // A base64 code that lost its "+" to form decoding is put back.
        val code = raw.trim().replace(' ', '+')
        return code.takeIf { isValid(it) }
    }

    /**
     * The code in a web link: the share link `https://learnwithalphonso.com/r/<code>` (an App Link) or the older
     * `https://learnwithalphonso.com/?ref=<code>`; null for any other URL.
     */
    fun codeFromUrl(url: String): String? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        if (uri.scheme != "https" || uri.host?.lowercase() !in ACCEPTED_HOSTS) return null
        codeFromSharePath(uri.rawPath)?.let { return it }
        val query = uri.rawQuery ?: return null
        val value = query.split('&').firstNotNullOfOrNull { pair ->
            val i = pair.indexOf('=')
            if (i > 0 && pair.substring(0, i) == "ref") pair.substring(i + 1) else null
        } ?: return null
        // Query decoding turns "+" into a space; codeFromParam puts it back, so "%2B" and "+" both read as "+".
        return codeFromParam(runCatching { URLDecoder.decode(value, "UTF-8") }.getOrNull())
    }

    /**
     * The code in the path `/r/<code>` (a trailing slash is fine), or null for any other path. The path is read still
     * percent-encoded so an encoded "/" in a code is not taken for a separator, and a literal "+" stays a "+".
     */
    fun codeFromSharePath(rawPath: String?): String? {
        val segments = (rawPath ?: return null).split('/').filter { it.isNotEmpty() }
        if (segments.size != 2 || segments[0] != "r") return null
        val decoded = runCatching { URLDecoder.decode(segments[1].replace("+", "%2B"), "UTF-8") }.getOrNull()
        return codeFromParam(decoded)
    }

    /** What a learner typed or pasted in the invite-code field: a bare code, or the whole referral link. */
    fun codeFromEntry(text: String): String? {
        val t = text.trim()
        // A typed entry never contains a space (a query value's "+" may have turned into one; a typed one is a typo).
        if (t.any { it.isWhitespace() }) return null
        return if (t.contains("://")) codeFromUrl(t) else codeFromParam(t)
    }

    /** The shareable link for a code: the site's origin plus `/r/<code>`. Same as the web's `referralLink`. */
    fun link(base: String, code: String): String {
        val encoded = URLEncoder.encode(code, "UTF-8").replace("+", "%20")
        return "${base.trimEnd('/')}/r/$encoded"
    }

    /** What a native share carries: the invitation line, then the link (the same words the web's share sheet sends). */
    fun shareText(link: String): String = "${ReferralCopy.SHARE_TEXT} $link"
}

data class ReferralRow(val status: String, val capped: Boolean, val completedAtMillis: Long?)

data class ReferralSummary(
    /** Friends who joined with this learner's link and finished a first lesson (even past the cap: they did join). */
    val completed: Int,
    /** Friends who joined with the link and have not finished a lesson yet. */
    val pending: Int,
    /** Rewarded referrals this UTC month (counts toward the cap). */
    val rewardedThisMonth: Int,
) {
    val capReached: Boolean get() = rewardedThisMonth >= ReferralConstants.MONTHLY_CAP
    val rewardsLeft: Int get() = maxOf(0, ReferralConstants.MONTHLY_CAP - rewardedThisMonth)

    val countLine: String
        get() {
            val done = if (completed == 0) "No friends have finished a first lesson yet"
            else "$completed friend${if (completed == 1) "" else "s"} joined and finished a first lesson"
            return if (pending > 0) "$done. $pending still to start." else "$done."
        }

    val rewardsLeftLine: String get() = "$rewardsLeft of ${ReferralConstants.MONTHLY_CAP} rewards left this month."

    companion object {
        /**
         * Counts from the learner's own referral rows (as referrer); mirrors the database's cap count: completed this UTC
         * month and not capped.
         */
        fun summarize(rows: List<ReferralRow>, nowMillis: Long): ReferralSummary {
            val monthStart = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(nowMillis), ZoneOffset.UTC)
                .withDayOfMonth(1).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            var completed = 0
            var pending = 0
            var rewarded = 0
            for (row in rows) {
                if (row.status == "pending") { pending += 1; continue }
                if (row.status != "completed") continue
                completed += 1
                val at = row.completedAtMillis
                if (!row.capped && at != null && at >= monthStart) rewarded += 1
            }
            return ReferralSummary(completed, pending, rewarded)
        }
    }
}

/** Where a captured code waits between the link opening the app and the account existing. */
interface ReferralCodeStore {
    fun load(): Kept?
    fun save(code: String, atMillis: Long)
    fun clear()

    data class Kept(val code: String, val atMillis: Long)
}

object ReferralPending {
    enum class Outcome { NONE, CLAIMED, REFUSED, RETRY_LATER }

    /** Remembers a code from the opening link. The FIRST code wins (a later link never replaces it). */
    fun capture(code: String?, store: ReferralCodeStore, nowMillis: Long) {
        val valid = ReferralLink.codeFromParam(code) ?: return
        if (read(store, nowMillis) != null) return
        store.save(valid, nowMillis)
    }

    /** The kept code, or null when there is none, it is older than 30 days, or the clock went backwards. */
    fun read(store: ReferralCodeStore, nowMillis: Long): String? {
        val kept = store.load() ?: return null
        val age = nowMillis - kept.atMillis
        if (age > ReferralConstants.KEEP_MS || age < -60_000) {
            store.clear()
            return null
        }
        return kept.code.takeIf { ReferralLink.isValid(it) }
    }

    /**
     * Sends the kept code once the learner is signed in. The stored code is cleared on every FINAL answer (claimed, or
     * refused for a real reason) and kept only for an unexplained error, so a flaky network does not lose the referral.
     */
    suspend fun claimPending(
        store: ReferralCodeStore,
        nowMillis: Long,
        claim: suspend (String) -> ReferralClaimResult,
    ): Outcome {
        val code = read(store, nowMillis) ?: return Outcome.NONE
        val result = claim(code)
        if (!result.isFinal) return Outcome.RETRY_LATER
        store.clear()
        return if (result is ReferralClaimResult.Claimed) Outcome.CLAIMED else Outcome.REFUSED
    }

    /**
     * A code the learner typed or pasted. A final answer also clears any captured code (it has been used or is moot), so
     * the automatic path never claims a second time.
     */
    suspend fun claimManual(
        entry: String,
        store: ReferralCodeStore,
        claim: suspend (String) -> ReferralClaimResult,
    ): ReferralClaimResult {
        val code = ReferralLink.codeFromEntry(entry) ?: return ReferralClaimResult.Refused(ReferralClaimReason.UNKNOWN_CODE)
        val result = claim(code)
        if (result.isFinal) store.clear()
        return result
    }
}
