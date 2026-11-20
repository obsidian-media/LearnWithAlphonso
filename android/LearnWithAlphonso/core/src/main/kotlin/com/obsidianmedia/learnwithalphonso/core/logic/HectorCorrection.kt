package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * A gentle fix for the learner's last message: the words they said ([slip]), the better words ([fix]) and an optional
 * one-line [note]. Hector's server returns it as its own JSON field; [HectorCorrections] also runs over the assistant's
 * reply text as a second line of defence.
 */
data class HectorCorrection(val slip: String, val fix: String, val note: String? = null)

/**
 * Port of src/lib/hector-correction.ts and HectorCorrection.swift; shared/hector-corrections.json holds the inputs and
 * expected outputs all three test suites replay.
 *
 *  - Only an ASSISTANT reply is ever parsed; a learner's text is shown exactly as typed ([displayText]).
 *  - Every complete `<correction>...</correction>` block is removed from the shown text. The FIRST block is the correction
 *    (at most one per turn); a second is stripped and ignored. A first block that is not valid means no correction.
 *  - Valid: a JSON object with non-empty `slip` and `fix` strings that differ; `note` optional. Malformed or partial blocks
 *    are dropped silently.
 *  - An unterminated block, and a trailing fragment of the opening tag, are removed so no half tag is ever visible.
 */
object HectorCorrections {
    private const val OPEN = "<correction>"
    private const val CLOSE = "</correction>"
    private const val SLIP_MAX = 200
    private const val FIX_MAX = 200
    private const val NOTE_MAX = 300
    private val BLOCK = Regex("<correction>([\\s\\S]*?)</correction>", RegexOption.IGNORE_CASE)
    /** An orphan closing tag, left when a "</correction>" sits inside a JSON string. */
    private val ORPHAN_CLOSE = Regex("</correction>", RegexOption.IGNORE_CASE)
    private val UNTERMINATED = Regex("<correction\\b[\\s\\S]*$", RegexOption.IGNORE_CASE)
    private val json = Json

    /** A finished assistant reply: the text to show and speak, and the correction when there is a valid one. */
    data class Extracted(val text: String, val correction: HectorCorrection?)

    fun extract(raw: String): Extracted {
        val first = BLOCK.find(raw)
        val correction = first?.let { parseBlock(it.groupValues[1]) }
        return Extracted(strip(raw, 2), correction)
    }

    /** The visible part of an assistant reply that is still arriving: never a half tag, however the chunks fall. */
    fun visibleWhileStreaming(partial: String): String = strip(partial, 1)

    /** What a bubble shows: only the assistant's text is parsed; a learner's text is theirs, tags and all. */
    fun displayText(role: String, content: String): String = if (role == "assistant") extract(content).text else content

    /** A correction as the server returns it (or as a block parses): the same rules, so a client never trusts the wire. */
    fun validate(value: JsonElement?): HectorCorrection? {
        val o = value as? JsonObject ?: return null
        fun str(key: String): String? = (o[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val slip = str("slip")?.trim() ?: return null
        val fix = str("fix")?.trim() ?: return null
        if (slip.isEmpty() || fix.isEmpty() || slip.length > SLIP_MAX || fix.length > FIX_MAX) return null
        if (slip.lowercase() == fix.lowercase()) return null
        val note = str("note")?.trim().orEmpty()
        if (note.length > NOTE_MAX) return null
        return HectorCorrection(slip, fix, note.ifEmpty { null })
    }

    private fun parseBlock(inner: String): HectorCorrection? =
        runCatching { validate(json.parseToJsonElement(inner.trim())) }.getOrNull()

    private fun strip(raw: String, minPartial: Int): String {
        val withoutOpen = UNTERMINATED.replace(ORPHAN_CLOSE.replace(BLOCK.replace(raw, ""), ""), "")
        val cut = partialOpenLength(withoutOpen, minPartial)
        return (if (cut > 0) withoutOpen.dropLast(cut) else withoutOpen).trim()
    }

    /** The longest tail of [text] that is a proper prefix of "<correction>" (at least [min] characters), or 0. */
    private fun partialOpenLength(text: String, min: Int): Int {
        for (tag in listOf(OPEN, CLOSE)) {
            for (n in minOf(tag.length - 1, text.length) downTo min) {
                if (tag.startsWith(text.takeLast(n).lowercase())) return n
            }
        }
        return 0
    }
}
