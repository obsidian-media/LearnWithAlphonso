package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * The friend code in https://learn.alphonsoecosystem.app/invite/{code}. Any web page can open that link, so the code
 * is accepted only in the shape the server issues (letters and digits; today 12 hex characters) before it reaches a
 * navigation route, where a slash or other character would change the route itself.
 */
object InviteLink {
    private val CODE = Regex("^[A-Za-z0-9]{6,64}$")

    /** The code for `invite/{code}` path segments, or null for anything else. */
    fun codeFrom(pathSegments: List<String>): String? {
        if (pathSegments.size != 2 || pathSegments[0] != "invite") return null
        return pathSegments[1].takeIf { CODE.matches(it) }
    }

    private val LINK = Regex("""^https://learn[.]alphonsoecosystem[.]app/invite/([A-Za-z0-9]{6,64})/?$""")

    /** What a learner typed or pasted in the friend-code field: a bare code, or the whole invite link. Null otherwise. */
    fun codeFromEntry(text: String): String? {
        val t = text.trim()
        return LINK.matchEntire(t)?.groupValues?.get(1) ?: t.takeIf { CODE.matches(it) }
    }
}
