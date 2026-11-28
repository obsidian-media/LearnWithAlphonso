package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.HectorCorrection
import com.obsidianmedia.learnwithalphonso.core.logic.HectorCorrections
import com.obsidianmedia.learnwithalphonso.core.logic.HectorCallEndResult
import com.obsidianmedia.learnwithalphonso.core.logic.HectorGreetingReply
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.core.avatar.ReplyVerdict
import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.logic.CallRecap
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalSpeaking
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemory
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemoryLoad
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordError
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordException
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordResult
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
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

/** One word of the transcript with the recogniser's own confidence for it (0-1), as /api/stt forwards it. */
data class SttWord(val word: String, val confidence: Double)

/** [words] is empty when the vendor gave none (the field is absent from the response then). */
data class SttResult(val text: String, val confidence: Double?, val words: List<SttWord> = emptyList())

data class GeneratedPracticeQuestion(val prompt: String, val choices: List<String>, val answerIndex: Int, val explanation: String)

/**
 * `code` is the stable machine code from the body's `error` field (`quota-exceeded`, `not-entitled`, ...) and is
 * never shown. `serverMessage` is only the human `detail` text, kept for diagnostics. Screens show
 * [AiErrorCopy.userMessage], same split as the iOS Kit's TutorError.
 */
sealed class AiConversationError(message: String) : Exception(message) {
    class Server(val status: Int, val serverMessage: String?, val code: String? = null, val resetsAt: String? = null) :
        AiConversationError("AI API returned $status")
    class InvalidPayload : AiConversationError("Unexpected AI response shape")
    class Timeout : AiConversationError("The request took too long")
}

/** One conversation reply: the text to show and speak, and the server's verdict on the learner's turn. */
data class ChatReply(val content: String, val verdict: ReplyVerdict)

/**
 * Port of AIConversationClient.swift: chat, speech synthesis, speech to text,
 * weakness analysis and generated practice over the web app's API routes.
 */
class AiConversationClient(private val http: ApiHttp) {
    private val json = ContentJson.json

    suspend fun chat(messages: List<ChatMessage>, systemPrompt: String? = null, cefrLevel: String? = null, course: String? = null): String =
        chatReply(messages, systemPrompt, cefrLevel, course).content

    /**
     * The same call as [chat], keeping the server's `verdict` about the learner's last turn (the talking avatar reacts
     * to it). An older server sends no verdict, which reads as [ReplyVerdict.NONE].
     */
    suspend fun chatReply(
        messages: List<ChatMessage>, systemPrompt: String? = null, cefrLevel: String? = null, course: String? = null, callId: String? = null,
        /** A rehearsal call sends only its id and stage, with no prompt and no course: the server builds the prompt itself. */
        source: com.obsidianmedia.learnwithalphonso.core.rehearsal.CallSource = com.obsidianmedia.learnwithalphonso.core.rehearsal.CallSource.Scenario,
    ): ChatReply {
        val body = com.obsidianmedia.learnwithalphonso.core.rehearsal.ChatRequestBody.build(
            source, systemPrompt, cefrLevel, course, callId, messages.map { it.role to it.content },
        )
        // The server says 502 empty-reply when the model returned nothing. One retry, never a loop.
        val first = http.post("api/chat", body)
        val response = if (first.status.value == 502 && ServerErrorBody.parse(first.bodyAsText()).code == "empty-reply") {
            http.post("api/chat", body)
        } else {
            first
        }
        val obj = objectOf(response)
        val content = obj.str("content") ?: throw AiConversationError.InvalidPayload()
        return ChatReply(content, ReplyVerdict.fromWire(obj.str("verdict")))
    }

    suspend fun practiceHub(course: String): com.obsidianmedia.learnwithalphonso.core.logic.PracticeHubData =
        json.decodeFromString(requireSuccess(http.get("api/practice", mapOf("course" to course))))

    suspend fun finishPractice(callId: String): com.obsidianmedia.learnwithalphonso.core.logic.PracticeResult =
        json.decodeFromString(requireSuccess(http.post("api/practice", buildJsonObject { put("callId", callId) })))

    /** `voice` is Alphonso's chosen voice (Settings > Voices); the server uses it only when it is on `course`'s allow-list. */
    /**
     * `character` is sent only for Hector (his greeting), so a voice the server refuses falls back to his default,
     * never Alphonso's; the server treats a missing one as Alphonso.
     */
    suspend fun synthesizeSpeech(text: String, voice: String? = null, course: String? = null, character: VoiceCharacter? = null): ByteArray {
        val response = http.post("api/tts", buildJsonObject {
            put("text", text); if (voice != null) put("voice", voice); if (course != null) put("course", course)
            if (character != null && character != VoiceCharacter.Alphonso) put("character", character.wire)
        })
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
        val words = (obj["words"] as? JsonArray)?.mapNotNull { entry ->
            val o = entry as? JsonObject ?: return@mapNotNull null
            val word = o.str("word") ?: return@mapNotNull null
            // A string confidence is skipped, as the web does (typeof number).
            val confidence = (o["confidence"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull ?: return@mapNotNull null
            SttWord(word, confidence)
        }.orEmpty()
        return SttResult(obj.str("text") ?: throw AiConversationError.InvalidPayload(), obj["confidence"]?.jsonPrimitive?.doubleOrNull, words)
    }

    suspend fun analyzeWeaknesses(transcript: List<ChatMessage>, course: String? = null): Int {
        val body = buildJsonObject {
            putJsonArray("messages") { transcript.forEach { add(buildJsonObject { put("role", it.role); put("content", it.content) }) } }
            if (course != null) put("course", course)
        }
        val obj = objectOf(http.post("api/analyze-weaknesses", body))
        return obj["weaknessesDetected"]?.jsonPrimitive?.intOrNull ?: throw AiConversationError.InvalidPayload()
    }

    // ---- Hector's memory ------------------------------------------------------------------------------------------

    /**
     * POST /api/hector-call-end: keeps what a finished Hector call showed (Pro, checked on the server). Throws an
     * [AiConversationError] (401, 403 consent, 429 quota, 503) so the caller can log why; a 200 with `saved: false`
     * is a result, not an error.
     */
    suspend fun hectorCallEnd(callId: String, course: String, cefrLevel: String?, messages: List<ChatMessage>): HectorCallEndResult {
        val body = buildJsonObject {
            put("callId", callId)
            put("course", course)
            if (cefrLevel != null) put("cefrLevel", cefrLevel)
            putJsonArray("messages") { messages.forEach { add(buildJsonObject { put("role", it.role); put("content", it.content) }) } }
        }
        return HectorCallEndResult.parse(requireSuccess(http.post("api/hector-call-end", body))) ?: throw AiConversationError.InvalidPayload()
    }

    /** POST /api/hector-greeting: Hector's memory-aware opening line (Pro; the server makes no AI call for it). */
    suspend fun hectorGreeting(course: String, cefrLevel: String?, lastVariant: Int?): HectorGreetingReply {
        val body = buildJsonObject {
            put("course", course)
            if (cefrLevel != null) put("cefrLevel", cefrLevel)
            if (lastVariant != null) put("lastVariant", lastVariant)
        }
        return HectorGreetingReply.parse(requireSuccess(http.post("api/hector-greeting", body))) ?: throw AiConversationError.InvalidPayload()
    }

    // ---- Call recap and What Alphonso remembers -------------------------------------------------------------------

    /**
     * POST /api/call-recap: the after-call recap (free). One attempt: null on anything but a clean recap (a short call,
     * offline, the AI or its checks failing, consent off, over the limit), and the result screen then keeps its slip.
     * Nothing is sent for a call under [CallRecap.MIN_LEARNER_TURNS] learner replies.
     */
    suspend fun callRecap(callId: String, transcript: List<ChatMessage>, cefrLevel: String? = null, scene: String? = null): CallRecap? =
        (callRecapAttempt(callId, transcript, cefrLevel, scene) as? RecapAttempt.Got)?.recap

    /** One attempt's outcome: a recap, nothing to show, or a failure a second try may fix (the screen offers "Try again"). */
    sealed interface RecapAttempt {
        data class Got(val recap: CallRecap, val rehearsalSpeaking: RehearsalSpeaking? = null) : RecapAttempt
        /** No recap, but a rehearsal run's "How you spoke" counts came back on their own. */
        data class SpeakingOnly(val rehearsalSpeaking: RehearsalSpeaking) : RecapAttempt
        data object Empty : RecapAttempt
        data object Retry : RecapAttempt
    }

    /** As [callRecap], but tells a retryable failure (offline, timeout, a 5xx, or the server's `retry`) from "nothing to show". */
    suspend fun callRecapAttempt(callId: String, transcript: List<ChatMessage>, cefrLevel: String? = null, scene: String? = null): RecapAttempt {
        if (!CallRecap.qualifies(transcript.map { it.role })) return RecapAttempt.Empty
        val body = buildJsonObject {
            put("callId", callId)
            putJsonArray("messages") { transcript.forEach { add(buildJsonObject { put("role", it.role); put("content", it.content) }) } }
            if (cefrLevel != null) put("cefrLevel", cefrLevel)
            if (scene != null) put("scene", scene)
        }
        return runCatching {
            val response = http.post("api/call-recap", body, timeoutMillis = RECAP_TIMEOUT_MS)
            val code = response.status.value
            if (code !in 200..299) {
                if (code >= 500 && code != 503) RecapAttempt.Retry else RecapAttempt.Empty
            } else {
                val text = response.bodyAsText()
                val speaking = RehearsalSpeaking.parse(text)
                CallRecap.parse(text)?.let { RecapAttempt.Got(it, speaking) }
                    ?: speaking?.let { RecapAttempt.SpeakingOnly(it) }
                    ?: if (CallRecap.retryRequested(text)) RecapAttempt.Retry else RecapAttempt.Empty
            }
        }.getOrElse { RecapAttempt.Retry }
    }

    /** POST /api/call-recap-review: "Review these". The server adds the recap's items from the signed recap it wrote. */
    suspend fun addRecapToReview(callId: String, reviewToken: String): Boolean = runCatching {
        http.post("api/call-recap-review", buildJsonObject { put("callId", callId); put("reviewToken", reviewToken) }).status.value in 200..299
    }.getOrDefault(false)

    /** GET /api/tutor-memory: open to every signed-in learner (a 403 from an older server still reads as locked). */
    suspend fun tutorMemory(): TutorMemoryLoad = runCatching {
        val response = http.get("api/tutor-memory")
        val status = response.status.value
        if (status == 403) TutorMemoryLoad.Locked
        else if (status !in 200..299) TutorMemoryLoad.Failed
        else TutorMemory.parse(response.bodyAsText())?.let { TutorMemoryLoad.Ready(it) } ?: TutorMemoryLoad.Failed
    }.getOrDefault(TutorMemoryLoad.Failed)

    /** DELETE /api/tutor-memory { id }: one memory line, with its weakness events and review items. */
    suspend fun removeMemoryLine(id: String): Boolean = deleteMemory(buildJsonObject { put("id", id) })

    /** DELETE /api/tutor-memory { all: true }: Forget everything. Lessons, stars, streak and XP stay. */
    suspend fun forgetEverything(): Boolean = deleteMemory(buildJsonObject { put("all", true) })

    private suspend fun deleteMemory(body: JsonObject): Boolean =
        runCatching { http.deleteWithBody("api/tutor-memory", body).status.value in 200..299 }.getOrDefault(false)

    /** DELETE /api/tutor-memory { events: true }: removes only the topic labels recorded after calls. Any learner. */
    suspend fun forgetTopicNotes(): Boolean = deleteMemory(buildJsonObject { put("events", true) })

    /** "Travel, 10 minutes a day": the learner's own first-run answers, for the locked What Alphonso remembers page. */
    suspend fun goalsNote(): String? = runCatching {
        val response = http.get("api/learner-profile")
        if (response.status.value !in 200..299) return@runCatching null
        val profile = json.parseToJsonElement(response.bodyAsText()).jsonObject["profile"]?.jsonObject ?: return@runCatching null
        val goals = TutorMemory.Goals(profile.str("goal"), profile["dailyMinutes"]?.jsonPrimitive?.intOrNull, runCatching { profile["interests"]!!.jsonArray.mapNotNull { it.jsonPrimitive.contentOrNull } }.getOrDefault(emptyList()))
        TutorMemory(emptyList(), emptyList(), goals).goalLines.map { it.title }.joinToString(", ").ifEmpty { null }
    }.getOrNull()

    /** PUT /api/learner-profile { patch }: adds or removes one goal answer (presets only, checked on the server). */
    suspend fun saveGoalPatch(patch: JsonObject): Boolean =
        runCatching { http.put("api/learner-profile", buildJsonObject { put("patch", patch) }).status.value in 200..299 }.getOrDefault(false)

    /**
     * POST /api/define-word: saves a tapped word with its sentence and returns its stored explanation. The server writes
     * the review item; the client never sends choices or an answer. An HTTP failure throws a [SavedWordException] so the
     * caller can say something specific; a transport failure (offline) propagates as the exception it is.
     */
    suspend fun defineWord(word: String, sentence: String, course: String): SavedWordResult {
        // A model call: allow it as long as the iOS app does (60 s) rather than the shared client's short default.
        val response = http.post("api/define-word", buildJsonObject { put("word", word); put("sentence", sentence); put("course", course) }, timeoutMillis = DEFINE_WORD_TIMEOUT_MS)
        val text = response.bodyAsText()
        if (response.status.value !in 200..299) throw SavedWordException(SavedWordError.from(response.status.value, ServerErrorBody.parse(text).code))
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: throw SavedWordException(SavedWordError.UNAVAILABLE)
        // A 200 that is not the contract's shape is not a save: showing "Saved" for it would be a lie.
        // A real JSON boolean only: the string "true" is not one.
        val alreadySaved = obj["alreadySaved"]?.let { runCatching { it.jsonPrimitive }.getOrNull() }?.takeIf { !it.isString }?.booleanOrNull
        val savedWord = obj.str("word")
        val savedSentence = obj.str("sentence")
        val explanation = obj.str("explanation")
        if (alreadySaved == null || savedWord == null || savedSentence == null || explanation == null) throw SavedWordException(SavedWordError.UNAVAILABLE)
        return SavedWordResult(alreadySaved, savedWord, savedSentence, explanation)
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
        if (response.status.value !in 200..299) {
            val e = ServerErrorBody.parse(text)
            throw AiConversationError.Server(response.status.value, e.detail, e.code, e.resetsAt)
        }
        return text
    }

    private fun JsonObject.str(key: String): String? = this[key]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }

    companion object {
        const val GENERATE_TIMEOUT_MS = 45_000L
        const val DEFINE_WORD_TIMEOUT_MS = 60_000L
        const val RECAP_TIMEOUT_MS = 10_000L

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
    /** A gentle fix for the learner's last message, when Hector found one worth making; null when absent or invalid. */
    val correction: HectorCorrection? = null,
) {
    /** Decoded reply audio, or null when the server sent none. */
    fun audioBytes(): ByteArray? = audioBase64.takeIf { it.isNotEmpty() }?.let { runCatching { Base64.getDecoder().decode(it) }.getOrNull() }
}

/** Same `code` / `serverMessage` split as [AiConversationError.Server]. */
sealed class TutorConversationError(message: String) : Exception(message) {
    class Server(val status: Int, val serverMessage: String?, val code: String? = null, val resetsAt: String? = null) :
        TutorConversationError("Tutor API returned $status")
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
        /** The conversation's course; the server resolves the prompt, voice and reply language from it. */
        course: String? = null,
        /** The learner's level in this course, so the tutor's system prompt can pitch its replies. Omitted when unknown. */
        cefrLevel: String? = null,
        /** Hector's chosen voice for this course (Settings > Voices); the server uses it only when it is allow-listed. */
        voice: String? = null,
    ): TutorReply {
        val body = buildJsonObject {
            put("session_id", sessionId)
            put("text", text)
            put("language", language)
            if (course != null) put("course", course)
            put("agent_id", agentId)
            put("tts_model", ttsModel)
            put("piper_voice", piperVoice)
            if (!cefrLevel.isNullOrEmpty()) put("cefr_level", cefrLevel)
            if (voice != null) put("voice", voice)
            putJsonArray("history") { history.forEach { add(buildJsonObject { put("role", it.role); put("content", it.content) }) } }
        }
        val response = http.post("api/hector-respond", body, extraHeaders = mapOf("X-Alphonso-Device-Id" to deviceId))
        val textBody = response.bodyAsText()
        if (response.status.value !in 200..299) {
            val e = ServerErrorBody.parse(textBody)
            throw TutorConversationError.Server(response.status.value, e.detail, e.code, e.resetsAt)
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
            correction = HectorCorrections.validate(o["correction"]),
        )
    }
}
