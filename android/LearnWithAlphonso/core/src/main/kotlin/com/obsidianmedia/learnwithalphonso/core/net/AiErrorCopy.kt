package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The parts of an AI route's error body: `{ error, detail?, resetsAt? }`. */
data class ServerErrorBody(val code: String?, val detail: String?, val resetsAt: String?) {
    companion object {
        fun parse(text: String): ServerErrorBody {
            val o = runCatching { ContentJson.json.parseToJsonElement(text).jsonObject }.getOrNull()
                ?: return ServerErrorBody(null, null, null)
            fun s(k: String) = o[k]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }?.trim()?.takeIf { it.isNotEmpty() }
            return ServerErrorBody(s("error"), s("detail"), s("resetsAt"))
        }
    }
}

/**
 * Learner-facing copy for an AI failure, the same wording as the iOS Kit's TutorError.userMessage and the web's
 * quota copy. Reads the stable `error` code, then the status; never shows a machine code or raw server text.
 */
object AiErrorCopy {
    const val GENERIC = "Something went wrong on our side. Try again."
    const val CONNECTION = "Couldn't reach the server. Check your connection and try again."

    fun userMessage(e: Throwable, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
        val (status, code, resetsAt) = when (e) {
            is AiConversationError.Server -> Triple(e.status, e.code, e.resetsAt)
            is TutorConversationError.Server -> Triple(e.status, e.code, e.resetsAt)
            is AiConversationError.Timeout -> return "That took too long. Try again."
            is IOException -> return CONNECTION
            else -> return GENERIC
        }
        return when (code) {
            "quota-exceeded" -> quotaExceededMessage(resetsAt, now, zone)
            "not-entitled" -> "Hector is part of Alphonso Pro."
            "entitlement-unavailable" -> "We can't check your Pro access right now. Please try again shortly."
            "ai-consent-required" -> "Turn on AI features to practise speaking with a tutor."
            else -> if (status == 401) "You've been signed out. Please sign in again." else GENERIC
        }
    }

    /** Two minutes or less until the reset means the per-minute burst, not the daily cap. */
    fun quotaExceededMessage(resetsAt: String?, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
        val reset = resetsAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
            ?: return "You've reached today's AI practice limit. Try again tomorrow."
        if (reset.toEpochMilli() - now.toEpochMilli() <= 120_000) return "Too many requests. Wait a minute and try again."
        val time = DateTimeFormatter.ofPattern("h:mm a", Locale.US).withZone(zone).format(reset)
        return "You've reached today's AI practice limit. It resets at $time."
    }
}
