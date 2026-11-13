package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainDirection
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainRequest
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import java.io.IOException
import java.nio.channels.UnresolvedAddressException

/** What `POST /api/explain` returns: the text, the language it is in (ISO 639-1), its direction and whether it was cached. */
data class Explanation(val explanation: String, val language: String, val direction: ExplainDirection, val cached: Boolean)

enum class ExplainErrorKind {
    OFFLINE, QUOTA_EXCEEDED, AI_CONSENT_REQUIRED, NOT_SIGNED_IN, NOT_ENTITLED, UNSUPPORTED, UNAVAILABLE;

    /** Worth offering "Try again" for: reconnecting or waiting a moment can fix it. */
    val isRetryable: Boolean get() = this == OFFLINE || this == UNAVAILABLE
}

class ExplainException(val kind: ExplainErrorKind) : Exception(kind.name)

object ExplainErrors {
    /** The server's status (and its `error` code) as the kind of failure, the same table as the web's explain-client.ts. */
    fun kindFor(status: Int, code: String?): ExplainErrorKind = when (status) {
        400, 422 -> ExplainErrorKind.UNSUPPORTED
        401 -> ExplainErrorKind.NOT_SIGNED_IN
        // A 403 is the AI consent or a missing Pro entitlement; only the body tells them apart.
        403 -> if (code == "ai-consent-required") ExplainErrorKind.AI_CONSENT_REQUIRED else ExplainErrorKind.NOT_ENTITLED
        429 -> ExplainErrorKind.QUOTA_EXCEEDED
        else -> ExplainErrorKind.UNAVAILABLE
    }

    /** What the learner is told for each failure; same wording as the web and iOS. */
    fun copy(kind: ExplainErrorKind): String = when (kind) {
        ExplainErrorKind.OFFLINE -> "Explaining needs a connection. Try again when you are back online."
        ExplainErrorKind.QUOTA_EXCEEDED -> "You have used today's explanations. They come back tomorrow."
        ExplainErrorKind.AI_CONSENT_REQUIRED -> "AI features are turned off. Allow them to get explanations."
        ExplainErrorKind.NOT_SIGNED_IN -> "Sign in again to get explanations."
        ExplainErrorKind.NOT_ENTITLED -> "Explanations in Hector need Hector Pro."
        ExplainErrorKind.UNSUPPORTED -> "There is no explanation in your language for this one."
        ExplainErrorKind.UNAVAILABLE -> "Couldn't explain that. Try again."
    }
}

/**
 * Calls this repo's `/api/explain` (src/routes/api/explain.ts). The route reads the learner's language from the account,
 * so a request carries only the item. A failure always surfaces as an [ExplainException] with a kind the screen can
 * show; the ApiHttp layer already tells the consent store about a 403 `ai-consent-required`.
 */
class ExplainClient(private val http: ApiHttp) {
    suspend fun explain(request: ExplainRequest): Explanation {
        val response: HttpResponse
        val text: String
        try {
            response = http.post("api/explain", request.toJson(), timeoutMillis = TIMEOUT_MS)
            text = response.bodyAsText()
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            throw ExplainException(ExplainErrorKind.OFFLINE)
        } catch (e: UnresolvedAddressException) {
            throw ExplainException(ExplainErrorKind.OFFLINE)
        } catch (e: Exception) {
            throw ExplainException(ExplainErrorKind.UNAVAILABLE)
        }
        val status = response.status.value
        if (status !in 200..299) throw ExplainException(ExplainErrors.kindFor(status, ServerErrorBody.parse(text).code))
        return decode(text) ?: throw ExplainException(ExplainErrorKind.UNAVAILABLE)
    }

    companion object {
        /** A model call: allow it as long as the other AI calls. */
        const val TIMEOUT_MS = 60_000L

        /** The answer, or null when it is not the contract's shape (a 200 that is not an explanation is not one). */
        fun decode(text: String): Explanation? {
            val o = runCatching { ContentJson.json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            fun str(k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
            val explanation = str("explanation")?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val language = str("language") ?: return null
            val direction = ExplainDirection.parse(str("direction")) ?: return null
            val cached = (o["cached"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: return null
            return Explanation(explanation, language, direction, cached)
        }
    }
}
