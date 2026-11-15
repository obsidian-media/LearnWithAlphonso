package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * The app screens a Help answer may point at ("Open the subscription screen"): the Kotlin twin of the web's
 * `src/lib/support-links.ts`. The AI names one of these ids; it can never write a URL. An id outside this list is
 * dropped, never shown as a link.
 *
 * The server stores an AI answer's link as a trailing marker in the body, `[[link:<id>]]`, and lifts it into a `link`
 * field before the learner's client gets the message. This is the defence in depth on the client: it parses a marker
 * that still arrives in an `ai` body, and ignores every marker in any other kind of message (a learner who types the
 * marker gets their own text back, never a link). The marker is never shown.
 */
enum class SupportLinkId(val wire: String, val label: String) {
    SUBSCRIPTION("subscription", "Open the subscription screen"),
    AI_FEATURES("ai-features", "Open AI features"),
    SETTINGS("settings", "Open Settings"),
    LEAGUE("league", "Open your league");

    companion object {
        /** An id from the server or the model, or null when it is not on the list (case and spacing must match exactly). */
        fun parse(value: String?): SupportLinkId? = entries.firstOrNull { it.wire == value }
    }
}

enum class SupportMessageKind { YOU, AI, SUPPORT, SYSTEM;
    companion object {
        fun parse(wire: String?): SupportMessageKind? = when (wire) {
            "you" -> YOU
            "ai" -> AI
            "support" -> SUPPORT
            "system" -> SYSTEM
            else -> null
        }
    }
}

data class SupportMessage(val id: Long, val kind: SupportMessageKind, val body: String, val at: String, val link: SupportLinkId?)

object SupportLinks {
    private val MARKER = Regex("""\s*\[\[link:([^\]\s]*)]]\s*$""")

    /** An AI body split into its text and its link. An unknown id leaves no link; the marker never shows. */
    fun split(body: String): Pair<String, SupportLinkId?> {
        val m = MARKER.find(body) ?: return body to null
        return body.substring(0, m.range.first) to SupportLinkId.parse(m.groupValues[1])
    }

    /**
     * A message as the learner's screen draws it. Only an `ai` message carries a link, and only an allow-listed one: a
     * trailing marker is lifted off the body, a `link` the server already lifted is checked against the list, and every
     * other kind is left exactly as typed with no link.
     */
    fun present(kind: SupportMessageKind, body: String, serverLink: String?): Pair<String, SupportLinkId?> {
        if (kind != SupportMessageKind.AI) return body to null
        val (text, marked) = split(body)
        return text to (SupportLinkId.parse(serverLink) ?: marked)
    }
}
