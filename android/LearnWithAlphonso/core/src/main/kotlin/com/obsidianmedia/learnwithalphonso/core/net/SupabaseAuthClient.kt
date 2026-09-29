package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.content.TextContent
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

@Serializable
data class SupabaseSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long,
    val userId: String,
)

sealed class SupabaseAuthError(message: String) : Exception(message) {
    class Server(val status: Int, val serverMessage: String?) :
        SupabaseAuthError("Auth server returned $status${serverMessage?.let { ": $it" } ?: ""}")

    class InvalidPayload : SupabaseAuthError("Unexpected auth response shape")
}

/** A PKCE verifier and its S256 challenge, for the Google sign-in Custom Tab. */
data class PkceChallenge(val verifier: String, val challenge: String)

object OAuthPkce {
    private val random = SecureRandom()

    fun make(): PkceChallenge {
        val bytes = ByteArray(32).also(random::nextBytes)
        val verifier = base64Url(bytes)
        return PkceChallenge(verifier, challengeFor(verifier))
    }

    fun challengeFor(verifier: String): String =
        base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))

    /** Same authorize URL GoogleOAuthFlow.swift builds; Supabase's own Google client, no Android-specific credentials. */
    fun authorizeUrl(supabaseUrl: String, redirectTo: String, challenge: PkceChallenge): String {
        val base = supabaseUrl.trimEnd('/')
        return "$base/auth/v1/authorize?provider=google&redirect_to=${encode(redirectTo)}" +
            "&code_challenge=${encode(challenge.challenge)}&code_challenge_method=s256"
    }

    /** The `code` query parameter of the callback URI, or null. */
    fun authorizationCode(callbackUri: String): String? {
        val query = callbackUri.substringAfter('?', "").substringBefore('#')
        return query.split('&').firstOrNull { it.startsWith("code=") }?.substringAfter("code=")
            ?.let { java.net.URLDecoder.decode(it, "UTF-8") }?.takeIf { it.isNotEmpty() }
    }

    private fun encode(s: String) = java.net.URLEncoder.encode(s, "UTF-8")
    private fun base64Url(bytes: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

/**
 * Port of SupabaseAuthClient.swift over the GoTrue HTTP endpoints, plus the
 * password flows the web app offers (auth.tsx). Deliberately not supabase-kt:
 * the same wire contract as iOS, and SessionManager owns persistence.
 */
class SupabaseAuthClient(
    private val supabaseUrl: String,
    private val publishableKey: String,
    engine: HttpClientEngine,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private val client = HttpClient(engine) { expectSuccess = false }
    private val json = ContentJson.json

    suspend fun requestEmailOtp(email: String) {
        requireSuccess(post("auth/v1/otp", buildJsonObject { put("email", email); put("create_user", true) }))
    }

    suspend fun verifyEmailOtp(email: String, code: String): SupabaseSession =
        decodeSession(requireSuccess(post("auth/v1/verify", buildJsonObject { put("email", email); put("token", code); put("type", "email") })))

    suspend fun signInWithPassword(email: String, password: String): SupabaseSession =
        decodeSession(
            requireSuccess(
                post("auth/v1/token", buildJsonObject { put("email", email); put("password", password) }, mapOf("grant_type" to "password")),
            ),
        )

    /**
     * Null when the project requires email confirmation: GoTrue then returns
     * the user without a session and the learner must click the link first.
     */
    suspend fun signUpWithPassword(email: String, password: String, displayName: String, emailRedirectTo: String): SupabaseSession? {
        val body = buildJsonObject {
            put("email", email)
            put("password", password)
            putJsonObject("data") { put("display_name", displayName) }
        }
        val text = requireSuccess(post("auth/v1/signup", body, mapOf("redirect_to" to emailRedirectTo)))
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrElse { throw SupabaseAuthError.InvalidPayload() }
        if (obj["access_token"]?.jsonPrimitive?.contentOrNull == null) return null
        return decodeSession(text)
    }

    suspend fun resetPasswordForEmail(email: String, redirectTo: String) {
        requireSuccess(post("auth/v1/recover", buildJsonObject { put("email", email) }, mapOf("redirect_to" to redirectTo)))
    }

    suspend fun exchangeOAuthCode(code: String, codeVerifier: String): SupabaseSession =
        decodeSession(
            requireSuccess(
                post("auth/v1/token", buildJsonObject { put("auth_code", code); put("code_verifier", codeVerifier) }, mapOf("grant_type" to "pkce")),
            ),
        )

    suspend fun refresh(session: SupabaseSession): SupabaseSession =
        decodeSession(
            requireSuccess(
                post("auth/v1/token", buildJsonObject { put("refresh_token", session.refreshToken) }, mapOf("grant_type" to "refresh_token")),
            ),
        )

    private suspend fun post(path: String, body: JsonObject, query: Map<String, String> = emptyMap()): HttpResponse =
        client.post("${supabaseUrl.trimEnd('/')}/$path") {
            query.forEach { (k, v) -> parameter(k, v) }
            header("apikey", publishableKey)
            setBody(TextContent(body.toString(), ContentType.Application.Json))
        }

    private suspend fun requireSuccess(response: HttpResponse): String {
        val text = response.bodyAsText()
        if (response.status.value !in 200..299) throw SupabaseAuthError.Server(response.status.value, errorMessage(text))
        return text
    }

    private fun errorMessage(text: String): String? {
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
        return listOf("msg", "error_description", "error")
            .firstNotNullOfOrNull { key -> obj[key]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() } }
            ?.trim()?.takeIf { it.isNotEmpty() }
    }

    private fun decodeSession(text: String): SupabaseSession {
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrElse { throw SupabaseAuthError.InvalidPayload() }
        val accessToken = obj["access_token"]?.jsonPrimitive?.contentOrNull ?: throw SupabaseAuthError.InvalidPayload()
        val refreshToken = obj["refresh_token"]?.jsonPrimitive?.contentOrNull ?: throw SupabaseAuthError.InvalidPayload()
        val userId = obj["user"]?.jsonObject?.get("id")?.jsonPrimitive?.contentOrNull ?: throw SupabaseAuthError.InvalidPayload()
        val expiresAt = obj["expires_at"]?.jsonPrimitive?.doubleOrNull?.toLong()
            ?: obj["expires_in"]?.jsonPrimitive?.doubleOrNull?.let { nowSeconds() + it.toLong() }
            ?: (nowSeconds() + 3600)
        return SupabaseSession(accessToken, refreshToken, expiresAt, userId)
    }
}
