package com.obsidianmedia.learnwithalphonso.core.auth

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * The bot check on the email forms: what the native-captcha page (src/routes/native-captcha.tsx) has said, and whether
 * an email request may go now. Same rules as iOS (BotCheckGate.swift).
 *
 * - Waiting: no token yet, or the last one was spent or expired. Sending waits.
 * - Ready: a fresh single-use token; [spend] hands it to one request and goes back to waiting.
 * - Unavailable: no bot check is configured, or the page never answered (offline, an old server). Requests go without
 *   a token, exactly as before; the auth server only requires one once its captcha setting is on.
 */
class BotCheckGate {
    sealed interface State {
        data object Waiting : State
        data class Ready(val token: String) : State
        data object Unavailable : State
    }

    var state: State = State.Waiting
        private set

    /** True once the page has said anything; after that a slow token never turns into "send without one". */
    var heardFromPage = false
        private set

    val canSend: Boolean get() = state != State.Waiting

    /** One message from the page, as the JSON it posts: `{type:"token",token}`, `{type:"expired"}`, `{type:"unavailable"}`. */
    fun receive(json: String) {
        val obj = runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull() ?: return
        when ((obj["type"] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull) {
            "token" -> {
                val token = (obj["token"] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
                if (token.isNullOrEmpty()) return
                heardFromPage = true
                state = State.Ready(token)
            }
            "expired" -> {
                heardFromPage = true
                if (state != State.Unavailable) state = State.Waiting
            }
            "unavailable" -> {
                heardFromPage = true
                state = State.Unavailable
            }
        }
    }

    /** The page never answered: send without a token rather than block email sign-in. */
    fun pageTimedOut() {
        if (!heardFromPage && state == State.Waiting) state = State.Unavailable
    }

    /** The token for one request (null when there is no bot check). A spent token is never handed out twice. */
    fun spend(): String? {
        val ready = state as? State.Ready ?: return null
        state = State.Waiting
        return ready.token
    }

    companion object {
        /** Milliseconds without any word from the page before requests go without a token. */
        const val PAGE_TIMEOUT_MS = 10_000L
    }
}
