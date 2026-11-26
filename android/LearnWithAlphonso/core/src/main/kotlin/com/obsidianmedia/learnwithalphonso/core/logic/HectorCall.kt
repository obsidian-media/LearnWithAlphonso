package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.AiConversationError
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationError
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException
import java.util.UUID

/**
 * The pure rules of one Hector call, kept out of the view model so they can be tested: which turns the tutor is sent,
 * what a fresh "Call again" resets, when the weakness analysis runs, and why a background request failed.
 * Twin of the iOS Kit's HectorCall.swift; keep the two in step.
 */
object HectorCall {
    /** One call's identity: [callId] names the call, [sessionId] is the tutor session. "Call again" mints both afresh. */
    data class Ids(val callId: String, val sessionId: String) {
        companion object {
            fun fresh() = Ids(UUID.randomUUID().toString(), UUID.randomUUID().toString())
        }
    }

    /** Learner turns a call needs before it is kept in what Hector remembers (the server enforces the same minimum). */
    const val MIN_LEARNER_TURNS_TO_SAVE = 3

    /** Whether the finished call should be sent to /api/hector-call-end: at least three learner turns. */
    fun qualifiesForCallEnd(turns: List<ChatMessage>): Boolean = turns.count { it.role == "user" } >= MIN_LEARNER_TURNS_TO_SAVE

    /**
     * The history sent with a turn: every turn BEFORE the learner's current one, which travels in `text` and which the
     * server appends itself. [turns] already ends with that current learner turn.
     */
    fun priorTurns(turns: List<ChatMessage>): List<ChatMessage> =
        if (turns.lastOrNull()?.role == "user") turns.dropLast(1) else turns

    const val MIN_TURNS_TO_ANALYSE = 4

    /** Once per stretch, never for a short call, and never when a recap already analysed the call (it would bill twice). */
    fun shouldAnalyse(turnCount: Int, analysedTurnCount: Int, recapAttempted: Boolean): Boolean =
        !recapAttempted && turnCount >= MIN_TURNS_TO_ANALYSE && turnCount > analysedTurnCount

    /** Why a background request failed, as a short stable label for the log: consent, quota, auth, network or server. */
    fun failureReason(e: Throwable): String {
        val (status, code) = when (e) {
            is AiConversationError.Server -> e.status to e.code
            is TutorConversationError.Server -> e.status to e.code
            is AiConversationError.Timeout, is IOException -> return "network"
            else -> return "server"
        }
        return when {
            code == "ai-consent-required" || status == 403 && code == null -> "consent"
            code == "quota-exceeded" || status == 429 -> "quota"
            code == "not-entitled" || code == "entitlement-unavailable" || status == 401 -> "auth"
            else -> "server"
        }
    }
}

/**
 * The per-call state of a Hector conversation. A call is a sequence of segments: a segment ends when its call-end is
 * sent (hang-up, or the learner leaving the screen), and when the learner talks again after that a new segment starts
 * with a fresh call id, so the later turns are saved as their own call. A plain class so it is testable without a
 * view model.
 */
class HectorCallTracker(initial: HectorCall.Ids = HectorCall.Ids.fresh()) {
    /** A segment's call-end to send: the call id and the segment's turns (the greeting included for the first). */
    data class Segment(val callId: String, val messages: List<ChatMessage>)

    var ids: HectorCall.Ids = initial
        private set
    private var segmentStart = 0
    private var analysedTurnCount = 0
    private var callEndSentFor: String? = null
    private var recapAttempted = false

    /** True once this segment's call-end succeeded (it records the weakness events itself). */
    @Synchronized
    fun recapAttempted(): Boolean = recapAttempted

    /** True once this segment's call-end was claimed (sent, or in flight). */
    @Synchronized
    fun callEndSent(): Boolean = callEndSentFor == ids.callId

    /** This segment's turns. */
    @Synchronized
    fun segmentTurns(turns: List<ChatMessage>): List<ChatMessage> = turns.drop(segmentStart)

    /** The learner is about to add a turn ([turnCountBefore] turns so far): after a sent call-end this starts a new segment. */
    @Synchronized
    fun onLearnerTurn(turnCountBefore: Int) {
        if (callEndSentFor != ids.callId) return
        ids = HectorCall.Ids(HectorCall.Ids.fresh().callId, ids.sessionId)
        segmentStart = turnCountBefore
        analysedTurnCount = 0
        recapAttempted = false
        callEndSentFor = null
    }

    /** The segment to send to /api/hector-call-end: once per call id, and only with at least three learner turns. */
    @Synchronized
    fun claimCallEnd(turns: List<ChatMessage>): Segment? {
        val segment = turns.drop(segmentStart)
        if (callEndSentFor == ids.callId || !HectorCall.qualifiesForCallEnd(segment)) return null
        callEndSentFor = ids.callId
        return Segment(ids.callId, segment)
    }

    /**
     * The call-end of [callId] was kept (`saved` or `already_saved`): it recorded the weakness events, so no separate
     * analysis. After an error or a `saved: false` the analysis stays the fallback.
     */
    @Synchronized
    fun callEndSucceeded(callId: String) {
        if (callId == ids.callId) recapAttempted = true
    }

    /** True once per stretch of the segment: the caller then sends the weakness analysis of [segmentTurns]. */
    @Synchronized
    fun claimAnalysis(turns: List<ChatMessage>): Boolean {
        val count = turns.size - segmentStart
        if (!HectorCall.shouldAnalyse(count, analysedTurnCount, recapAttempted)) return false
        analysedTurnCount = count
        return true
    }

    /** "Call again": a new call id and session, an empty thread, and a clean slate. */
    @Synchronized
    fun startNewCall(): HectorCall.Ids {
        ids = HectorCall.Ids.fresh()
        segmentStart = 0
        analysedTurnCount = 0
        recapAttempted = false
        callEndSentFor = null
        return ids
    }
}

/** POST /api/hector-call-end's answer: `{ saved: true, lines }` or `{ saved: false, reason }`. */
data class HectorCallEndResult(val saved: Boolean, val lines: Int = 0, val reason: String? = null) {
    /** The call is in Hector's memory (now, or already): its weakness events are recorded too. */
    val kept: Boolean get() = saved || reason == "already_saved"

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun parse(text: String): HectorCallEndResult? {
            val o = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            val saved = o["saved"]?.let { runCatching { it.jsonPrimitive.booleanOrNull }.getOrNull() } ?: return null
            val lines = o["lines"]?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() } ?: 0
            val reason = o["reason"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
            return HectorCallEndResult(saved, lines, reason)
        }
    }
}

/** POST /api/hector-greeting's answer: Hector's memory-aware opening line (Pro; the server makes no AI call). */
data class HectorGreetingReply(val greeting: String, val topic: String?, val variant: Int, val remembered: Boolean) {
    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun parse(text: String): HectorGreetingReply? {
            val o = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            val greeting = o["greeting"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val topic = o["topic"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
            val variant = o["variant"]?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() } ?: 0
            val remembered = o["remembered"]?.let { runCatching { it.jsonPrimitive.booleanOrNull }.getOrNull() } ?: false
            return HectorGreetingReply(greeting, topic, variant, remembered)
        }
    }
}

/** The last greeting variant used per course, so the server can vary the next one. */
class HectorGreetingVariants(private val read: (String) -> Int?, private val write: (String, Int) -> Unit) {
    private fun key(course: String) = "hector.greetingVariant.$course"
    fun last(course: String): Int? = read(key(course))
    fun save(variant: Int, course: String) = write(key(course), variant)
}

/** What Hector opens a call with, and where it came from. */
data class HectorOpening(val text: String, val fromServer: Boolean, val fallbackReason: String? = null) {
    companion object {
        /** A slow greeting request gives way to the local template after this long. */
        const val GREETING_TIMEOUT_MS = 5_000L

        /**
         * The server's memory-aware line, or the local template when the request fails, is offline, or answers with an
         * empty line. The server's variant is remembered per course and sent back next time.
         */
        suspend fun resolve(
            course: String, variants: HectorGreetingVariants, localFallback: String,
            timeoutMillis: Long = GREETING_TIMEOUT_MS,
            fetch: suspend (lastVariant: Int?) -> HectorGreetingReply,
        ): HectorOpening {
            val reply = try {
                kotlinx.coroutines.withTimeout(timeoutMillis) { fetch(variants.last(course)) }
            } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                return HectorOpening(localFallback, fromServer = false, fallbackReason = "network")
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                return HectorOpening(localFallback, fromServer = false, fallbackReason = HectorCall.failureReason(e))
            }
            val text = reply.greeting.trim()
            if (text.isEmpty()) return HectorOpening(localFallback, fromServer = false, fallbackReason = "server")
            variants.save(reply.variant, course)
            return HectorOpening(text, fromServer = true)
        }
    }
}
