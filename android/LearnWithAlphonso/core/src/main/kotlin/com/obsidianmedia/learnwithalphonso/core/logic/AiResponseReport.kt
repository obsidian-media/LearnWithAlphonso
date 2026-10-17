package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Report strings, the same text as the iOS Kit's AIConsentCopy.swift and src/lib/ai-consent-copy.ts (ai-consent-copy-parity.test.ts). */
object AiReportCopy {
    const val reportAction = "Report this response"
    const val reportThanks = "Thanks. We'll review this response."
    const val reportFailed = "Couldn't send your report. Check your connection and try again."
    const val reportReviewNote = "We review reports within 24 hours."
}

enum class AiResponseSurface(val wire: String) { HECTOR("hector"), CONVERSATION("conversation"), CAMPAIGN("campaign") }

/** The codes and labels are the web's AI_REPORT_REASONS, in the same order. */
enum class AiResponseReportReason(val code: String, val label: String) {
    INAPPROPRIATE("ai_inappropriate", "Inappropriate or offensive"),
    HARMFUL("ai_harmful", "Harmful or unsafe"),
    INCORRECT("ai_incorrect", "Wrong or misleading"),
    OTHER("ai_other", "Something else"),
}

/**
 * One AI message reported by the learner. Stored in `content_reports` as kind 'ai_response' with no reported user;
 * the text goes in `context.message`. Port of AIResponseReport.swift and src/lib/ai-report-budget.ts.
 */
class AiResponseReport(
    message: String,
    val surface: AiResponseSurface,
    val course: String,
    val reason: AiResponseReportReason,
    val scenarioId: String? = null,
    val campaignId: String? = null,
    val sceneIndex: Int? = null,
) {
    /** The message as stored: U+0000 and lone surrogates removed, cut to the cap and the byte budget on a code point boundary. */
    val message: String = capped(
        message,
        byteBudget = CONTEXT_BYTE_LIMIT - CONTEXT_STRUCTURE_BYTES - jsonBytes(course) - jsonBytes(scenarioId ?: "") - jsonBytes(campaignId ?: ""),
    )

    /** The `content_reports` row: kind, reason and the context object. */
    fun toRow(): JsonObject = buildJsonObject {
        put("kind", "ai_response")
        put("reason", reason.code)
        put(
            "context",
            buildJsonObject {
                put("message", message)
                put("surface", surface.wire)
                put("course", course)
                put("platform", "android")
                scenarioId?.let { put("scenario_id", it) }
                campaignId?.let { put("campaign_id", it) }
                sceneIndex?.let { put("scene_index", it) }
            },
        )
    }

    companion object {
        /** The same cap as the web (AI_REPORT_MESSAGE_MAX), counted in code points, never in the middle of an emoji. */
        const val MAX_MESSAGE_LENGTH = 2500

        /**
         * `content_reports.context` is checked as `octet_length(context::text) <= 8192`: the size of the JSON text, where
         * a quote, backslash or newline costs 2 bytes, another control character 6 and an emoji 4.
         */
        const val CONTEXT_BYTE_LIMIT = 8192

        /** Room for the keys, braces, quotes and the spaces the database adds after colons and commas. */
        const val CONTEXT_STRUCTURE_BYTES = 400

        /** Bytes `text` takes inside a JSON string, which is what the database counts. */
        fun jsonBytes(text: String): Int {
            var total = 0
            var i = 0
            while (i < text.length) {
                val cp = text.codePointAt(i)
                total += jsonBytes(cp)
                i += Character.charCount(cp)
            }
            return total
        }

        fun jsonBytes(codePoint: Int): Int = when {
            codePoint == 0x22 || codePoint == 0x5C || codePoint == 0x0A || codePoint == 0x0D || codePoint == 0x09 || codePoint == 0x08 || codePoint == 0x0C -> 2
            codePoint <= 0x1F -> 6
            // A lone surrogate is escaped (6) rather than written; capped() removes them, this keeps jsonBytes total.
            codePoint in 0xD800..0xDFFF -> 6
            codePoint <= 0x7F -> 1
            codePoint <= 0x7FF -> 2
            codePoint <= 0xFFFF -> 3
            else -> 4
        }

        /** jsonb cannot store U+0000 or a lone surrogate, so a report containing one would be refused whole. */
        internal fun capped(text: String, byteBudget: Int): String {
            val out = StringBuilder()
            var count = 0
            var bytes = 0
            var i = 0
            while (i < text.length) {
                val cp = text.codePointAt(i)
                i += Character.charCount(cp)
                if (cp == 0 || cp in 0xD800..0xDFFF) continue
                val width = jsonBytes(cp)
                if (count >= MAX_MESSAGE_LENGTH || bytes + width > byteBudget) break
                out.appendCodePoint(cp)
                count += 1
                bytes += width
            }
            return out.toString()
        }
    }
}

/**
 * Which assistant turns can be reported, and which scene a turn belongs to (ConversationSnapshot in the iOS Kit).
 * Openers are tracked by position, so a model reply that repeats an opener's words is still a model reply.
 */
object AiReplyReporting {
    /** The fixed first line of a scene is ours, not the model's: it is not an AI response. */
    fun isReportable(role: String, index: Int, openerIndices: Set<Int>): Boolean = role == "assistant" && index !in openerIndices

    /** The scene a turn was made in: scenes start at their opener, so it is the number of openers up to and including the turn, minus one. */
    fun sceneIndexOfTurn(index: Int, openerIndices: Set<Int>): Int = maxOf(0, openerIndices.count { it <= index } - 1)
}
