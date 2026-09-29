package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.util.Base64

data class ChatMessage(val role: String, val content: String)

data class SttResult(val text: String, val confidence: Double?)

data class GeneratedPracticeQuestion(val prompt: String, val choices: List<String>, val answerIndex: Int, val explanation: String)

sealed class AiConversationError(message: String) : Exception(message) {
    class Server(val status: Int, val serverMessage: String?) : AiConversationError("AI API returned $status")
    class InvalidPayload : AiConversationError("Unexpected AI response shape")
    class Timeout : AiConversationError("The request took too long")
}

/**
 * Port of AIConversationClient.swift: chat, speech synthesis, speech to text,
 * weakness analysis and generated practice over the web app's API routes.
 */
class AiConversationClient(private val http: ApiHttp) {
    private val json = ContentJson.json

    suspend fun chat(messages: List<ChatMessage>, systemPrompt: String? = null, cefrLevel: String? = null): String {
        val body = buildJsonObject {
            putJsonArray("messages") { messages.forEach { add(buildJsonObject { put("role", it.role); put("content", it.content) }) } }
            if (systemPrompt != null) put("systemPrompt", systemPrompt)
            if (cefrLevel != null) put("cefrLevel", cefrLevel)
        }
        val obj = objectOf(http.post("api/chat", body))
        return obj.str("content") ?: throw AiConversationError.InvalidPayload()
    }

    suspend fun synthesizeSpeech(text: String, voice: String? = null): ByteArray {
        val response = http.post("api/tts", buildJsonObject { put("text", text); if (voice != null) put("voice", voice) })
        requireSuccess(response)
        return response.readRawBytes()
    }

    /** Multipart upload with field `file`, plus optional `course` and `debugTiming`, same as iOS. */
    suspend fun transcribe(audio: ByteArray, mimeType: String = "audio/m4a", course: String? = null, debugTiming: String? = null): SttResult {
        val parts = buildList {
            add(MultipartPart.File("file", "recording.${extensionFor(mimeType)}", mimeType, audio))
            if (course != null) add(MultipartPart.Field("course", course))
            if (debugTiming != null) add(MultipartPart.Field("debugTiming", debugTiming))
        }
        val obj = objectOf(http.postMultipart("api/stt", parts))
        return SttResult(obj.str("text") ?: throw AiConversationError.InvalidPayload(), obj["confidence"]?.jsonPrimitive?.doubleOrNull)
    }

    suspend fun analyzeWeaknesses(transcript: List<ChatMessage>): Int {
        val body = buildJsonObject { putJsonArray("messages") { transcript.forEach { add(buildJsonObject { put("role", it.role); put("content", it.content) }) } } }
        val obj = objectOf(http.post("api/analyze-weaknesses", body))
        return obj["weaknessesDetected"]?.jsonPrimitive?.intOrNull ?: throw AiConversationError.InvalidPayload()
    }

    /** Capped at 45 seconds, the iOS safety net against a spinner that never ends. */
    suspend fun generatePractice(lessonId: String, course: String, timeoutMs: Long = GENERATE_TIMEOUT_MS): List<GeneratedPracticeQuestion> {
        val response = try {
            withTimeout(timeoutMs) { http.post("api/generate-practice", buildJsonObject { put("lessonId", lessonId); put("course", course) }) }
        } catch (e: TimeoutCancellationException) {
            throw AiConversationError.Timeout()
        }
        val obj = objectOf(response)
        val rows = obj["questions"]?.let { runCatching { it.jsonArray }.getOrNull() } ?: throw AiConversationError.InvalidPayload()
        return rows.mapNotNull { row ->
            val o = runCatching { row.jsonObject }.getOrNull() ?: return@mapNotNull null
            GeneratedPracticeQuestion(
                prompt = o.str("prompt") ?: return@mapNotNull null,
                choices = o["choices"]?.let { runCatching { it.jsonArray.map { c -> c.jsonPrimitive.content } }.getOrNull() } ?: return@mapNotNull null,
                answerIndex = o["answerIndex"]?.jsonPrimitive?.intOrNull ?: return@mapNotNull null,
                explanation = o.str("explanation") ?: return@mapNotNull null,
            )
        }
    }

    private suspend fun objectOf(response: HttpResponse): JsonObject {
        val text = requireSuccess(response)
        return runCatching { json.parseToJsonElement(text).jsonObject }.getOrElse { throw AiConversationError.InvalidPayload() }
    }

    private suspend fun requireSuccess(response: HttpResponse): String {
        val text = response.bodyAsText()
        if (response.status.value !in 200..299) throw AiConversationError.Server(response.status.value, errorOf(text))
        return text
    }

    private fun errorOf(text: String): String? =
        runCatching { json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull }.getOrNull()?.trim()?.takeIf { it.isNotEmpty() }

    private fun JsonObject.str(key: String): String? = this[key]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }

    companion object {
        const val GENERATE_TIMEOUT_MS = 45_000L

        fun extensionFor(mimeType: String): String = when (mimeType) {
            "audio/m4a", "audio/mp4", "audio/x-m4a" -> "m4a"
            "audio/wav", "audio/x-wav", "audio/wave" -> "wav"
            "audio/webm" -> "webm"
            "audio/mpeg", "audio/mp3" -> "mp3"
            else -> "m4a"
        }
    }
}

data class TutorTimings(val llm: Int, val tts: Int, val total: Int)

data class TutorReply(
    val requestId: String,
    val sessionId: String,
    val agent: String,
    val reply: String,
    val audioBase64: String,
    val ttsModel: String,
    val ttsProvider: String,
    val language: String,
    val state: String,
    val timingsMs: TutorTimings?,
) {
    /** Decoded reply audio, or null when the server sent none. */
    fun audioBytes(): ByteArray? = audioBase64.takeIf { it.isNotEmpty() }?.let { runCatching { Base64.getDecoder().decode(it) }.getOrNull() }
}

sealed class TutorConversationError(message: String) : Exception(message) {
    class Server(val status: Int, val serverMessage: String?) : TutorConversationError("Tutor API returned $status")
    class InvalidPayload : TutorConversationError("Unexpected tutor response shape")
}

/** Port of TutorConversationClient.swift over `/api/hector-respond`. */
class TutorConversationClient(private val http: ApiHttp, private val deviceId: String) {
    private val json = ContentJson.json

    suspend fun respond(
        sessionId: String,
        text: String,
        language: String,
        history: List<ChatMessage>,
        agentId: String = "tutor",
        ttsModel: String = "magpie",
        piperVoice: String = "mana",
    ): TutorReply {
        val body = buildJsonObject {
            put("session_id", sessionId)
            put("text", text)
            put("language", language)
            put("agent_id", agentId)
            put("tts_model", ttsModel)
            put("piper_voice", piperVoice)
            putJsonArray("history") { history.forEach { add(buildJsonObject { put("role", it.role); put("content", it.content) }) } }
        }
        val response = http.post("api/hector-respond", body, extraHeaders = mapOf("X-Alphonso-Device-Id" to deviceId))
        val textBody = response.bodyAsText()
        if (response.status.value !in 200..299) {
            val detail = runCatching { json.parseToJsonElement(textBody).jsonObject["detail"]?.jsonPrimitive?.contentOrNull }.getOrNull()?.trim()?.takeIf { it.isNotEmpty() }
            throw TutorConversationError.Server(response.status.value, detail)
        }
        val o = runCatching { json.parseToJsonElement(textBody).jsonObject }.getOrElse { throw TutorConversationError.InvalidPayload() }
        fun s(k: String) = o[k]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
        val timings = o["timings_ms"]?.let { runCatching { it.jsonObject }.getOrNull() }?.let { t ->
            TutorTimings(t["llm"]?.jsonPrimitive?.intOrNull ?: 0, t["tts"]?.jsonPrimitive?.intOrNull ?: 0, t["total"]?.jsonPrimitive?.intOrNull ?: 0)
        }
        return TutorReply(
            requestId = s("request_id") ?: "",
            sessionId = s("session_id") ?: sessionId,
            agent = s("agent") ?: agentId,
            reply = s("reply") ?: throw TutorConversationError.InvalidPayload(),
            audioBase64 = s("audio_base64") ?: "",
            ttsModel = s("tts_model") ?: "",
            ttsProvider = s("tts_provider") ?: "",
            language = s("language") ?: language,
            state = s("state") ?: "",
            timingsMs = timings,
        )
    }
}
