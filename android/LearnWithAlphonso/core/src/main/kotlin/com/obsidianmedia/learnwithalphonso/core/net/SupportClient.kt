package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.logic.SupportLinks
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessage
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessageKind
import com.obsidianmedia.learnwithalphonso.core.logic.SupportStatus
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.io.IOException
import java.nio.channels.UnresolvedAddressException

/** What the Help chat reads: the status, how many person replies are unread, the messages and whether the AI is on. */
data class SupportConversation(val status: SupportStatus, val unread: Int, val messages: List<SupportMessage>, val aiAvailable: Boolean)

/** What a send or a hand-off returns: the status now, and the messages (new ones for a send, all for a hand-off). */
data class SupportUpdate(val status: SupportStatus, val messages: List<SupportMessage>)

enum class SupportErrorKind {
    OFFLINE,
    /** 503 `support-unreachable`: the learner's message IS saved on the server. */
    UNREACHABLE,
    /** 429 `support-message-limit`, 50 learner messages a day. */
    DAILY_LIMIT,
    /** 429 `support-message-limit`, 100 messages in one conversation. */
    CONVERSATION_LIMIT,
    FAILED,
}

class SupportException(val kind: SupportErrorKind) : Exception(kind.name)

/**
 * The Help chat routes (`/api/support/conversation`, `/message`, `/handoff`): the Kotlin twin of `src/lib/support-client.ts`.
 * The learner id is the session's; a request carries only the text and a client id (a retry with the same id is safe: the
 * server returns the stored message instead of posting twice). Every reply is checked here: a link id outside the
 * allow-list becomes null, a marker in an `ai` body is lifted off, and no other kind ever carries a link.
 *
 * It works with the AI switch off: the server then answers as a person's inbox and `aiAvailable` is false.
 */
class SupportClient(private val http: ApiHttp) {
    suspend fun fetchConversation(): SupportConversation {
        val text = request { http.get("api/support/conversation") }
        return decodeConversation(text) ?: throw SupportException(SupportErrorKind.FAILED)
    }

    suspend fun send(text: String, clientId: String): SupportUpdate {
        val body = buildJsonObject { put("text", text); put("clientId", clientId) }
        val reply = request { http.post("api/support/message", body, timeoutMillis = TIMEOUT_MS) }
        return decodeUpdate(reply) ?: throw SupportException(SupportErrorKind.FAILED)
    }

    suspend fun handoff(): SupportUpdate {
        val reply = request { http.post("api/support/handoff", buildJsonObject { }, timeoutMillis = TIMEOUT_MS) }
        return decodeUpdate(reply) ?: throw SupportException(SupportErrorKind.FAILED)
    }

    private suspend fun request(call: suspend () -> HttpResponse): String {
        val response: HttpResponse
        val text: String
        try {
            response = call()
            text = response.bodyAsText()
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            throw SupportException(SupportErrorKind.OFFLINE)
        } catch (e: UnresolvedAddressException) {
            throw SupportException(SupportErrorKind.OFFLINE)
        } catch (e: Exception) {
            throw SupportException(SupportErrorKind.FAILED)
        }
        val status = response.status.value
        if (status !in 200..299) throw SupportException(errorKind(status, text))
        return text
    }

    companion object {
        /** A model may answer: allow it as long as the other AI calls. */
        const val TIMEOUT_MS = 60_000L

        /** The server's status and body as the kind of failure, the same table as the web client. */
        fun errorKind(status: Int, body: String): SupportErrorKind {
            val o = parseObject(body)
            val code = (o?.get("error") as? JsonPrimitive)?.contentOrNull
            val which = (o?.get("which") as? JsonPrimitive)?.contentOrNull
            return when {
                status == 503 && code == "support-unreachable" -> SupportErrorKind.UNREACHABLE
                status == 429 && code == "support-message-limit" -> if (which == "conversation") SupportErrorKind.CONVERSATION_LIMIT else SupportErrorKind.DAILY_LIMIT
                else -> SupportErrorKind.FAILED
            }
        }

        private fun parseObject(text: String): JsonObject? = runCatching { ContentJson.json.parseToJsonElement(text).jsonObject }.getOrNull()

        private fun str(o: JsonObject, k: String): String? = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

        /** One message, or null when it is not the contract's shape. */
        private fun message(o: JsonObject): SupportMessage? {
            val id = (o["id"] as? JsonPrimitive)?.takeIf { !it.isString }?.longOrNull ?: return null
            val kind = SupportMessageKind.parse(str(o, "kind")) ?: return null
            val body = str(o, "body") ?: return null
            val at = str(o, "at") ?: return null
            val (text, link) = SupportLinks.present(kind, body, str(o, "link"))
            // Only a person's reply carries a name; the label never shows it on any other row.
            val staffName = if (kind == SupportMessageKind.SUPPORT) str(o, "staffName")?.trim()?.takeIf { it.isNotEmpty() } else null
            return SupportMessage(id, kind, text, at, link, staffName)
        }

        private fun messages(o: JsonObject): List<SupportMessage>? {
            val arr = o["messages"] as? JsonArray ?: return null
            val out = ArrayList<SupportMessage>(arr.size)
            for (e in arr) out.add(message(e as? JsonObject ?: return null) ?: return null)
            return out
        }

        fun decodeUpdate(text: String): SupportUpdate? {
            val o = parseObject(text) ?: return null
            val status = SupportStatus.parse(str(o, "status")) ?: return null
            return SupportUpdate(status, messages(o) ?: return null)
        }

        fun decodeConversation(text: String): SupportConversation? {
            val o = parseObject(text) ?: return null
            val status = SupportStatus.parse(str(o, "status")) ?: return null
            val unread = (o["unread"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull?.takeIf { it >= 0 } ?: return null
            val ai = (o["aiAvailable"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: return null
            return SupportConversation(status, unread, messages(o) ?: return null, ai)
        }
    }
}
