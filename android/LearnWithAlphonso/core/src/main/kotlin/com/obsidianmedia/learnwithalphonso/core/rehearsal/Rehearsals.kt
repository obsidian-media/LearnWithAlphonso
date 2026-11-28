package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Rehearsals: practise one real, upcoming conversation over a few days. The twin of src/lib/rehearsal-api.ts and
 * src/lib/rehearsal-rules.ts (the words are src/lib/rehearsal-copy.ts). The shapes are the server's: the shared contract
 * is tests/fixtures/rehearsal-api.json, copied byte for byte into this module's test resources (guarded by
 * src/lib/rehearsal-native-fixtures.test.ts). Wire values stay plain strings, so a kind or stage a newer server adds
 * decodes fine and is drawn generically instead of failing the whole answer.
 */
enum class EventKind(val wire: String, val label: String, val placeholder: String, val short: String) {
    INTERVIEW("interview", "Job interview", "e.g. a hiring manager at a hospital", "interview"),
    MEETING("meeting", "Work meeting", "e.g. my team lead and two colleagues", "meeting"),
    PRESENTATION("presentation", "Presentation", "e.g. a small group of coworkers", "presentation"),
    APPOINTMENT("appointment", "Appointment", "e.g. a receptionist at a bank", "appointment"),
    HOUSING("housing", "Landlord or housing", "e.g. a landlord showing a flat", "meeting with the landlord"),
    FIRST_DAY("first_day", "First day at work", "e.g. my new manager and the team", "first day"),
    OTHER("other", "Something else", "e.g. the person I need to speak to", "conversation");

    companion object {
        fun fromWire(raw: String?): EventKind? = entries.firstOrNull { it.wire == raw }
    }
}

/** The three stages of a rehearsal, in order. */
enum class Stage(val wire: String, val label: String, val blurb: String, val minutes: Int) {
    WARMUP("warmup", "Warm-up", "The key phrases, in short exchanges.", 5),
    CONVERSATION("conversation", "The real conversation", "The whole conversation, start to finish.", 10),
    HARD_MOMENTS("hard_moments", "The hard moments", "The tough question, a misunderstanding, being interrupted.", 8);

    /** 1, 2 or 3: "Stage 2 of 3". */
    val number: Int get() = ordinal + 1

    companion object {
        fun fromWire(raw: String?): Stage? = entries.firstOrNull { it.wire == raw }
    }
}

/** The text of an intake answer is the learner's own words: short, filtered by the server, only quoted into prompts. */
const val INTAKE_TEXT_MAX = 200

/** The minimum learner turns before a rehearsal call is a finished run (src/lib/practice-calls.server.ts). */
const val REHEARSAL_FINISH_MIN_REPLIES = 4

/** The length of the warm-up offered on the day of the event, in minutes. */
const val WARMUP_TODAY_MINUTES = 2

@Serializable data class RehearsalPersona(val role: String = "", val tone: String = "")
@Serializable data class RehearsalHardMoment(val id: String = "", val label: String = "", val prompt: String = "")

@Serializable
data class RehearsalBrief(
    val setting: String = "",
    val persona: RehearsalPersona? = null,
    val keyPhrases: List<String> = emptyList(),
    val coreExchanges: List<String> = emptyList(),
    val hardMoments: List<RehearsalHardMoment> = emptyList(),
)

@Serializable
data class Rehearsal(
    val id: String,
    val course: String,
    val eventKind: String,
    /** YYYY-MM-DD, or null for "not sure yet". */
    val eventDate: String? = null,
    val counterpart: String,
    val worries: String? = null,
    val brief: RehearsalBrief? = null,
    val status: String,
    val free: Boolean = false,
    val outcome: JsonElement? = null,
    val createdAt: String,
    val closedAt: String? = null,
) {
    val kind: EventKind get() = EventKind.fromWire(eventKind) ?: EventKind.OTHER
}

/** What one finished run taught the tutor: moment labels and corrected forms only, never the learner's own words. */
@Serializable
data class RunMemory(
    val stage: String,
    val finishedAt: String,
    val momentsShown: List<String> = emptyList(),
    val wentWell: List<String> = emptyList(),
    val corrections: List<String> = emptyList(),
    /** Who played the partner ("alphonso" or "hector") and whether it was hard mode. A run from before Hector rehearsals has neither. */
    val persona: String? = null,
    val hardMode: Boolean = false,
) {
    val stageOrNull: Stage? get() = Stage.fromWire(stage)
}

/** A closed rehearsal in the history list: no brief, no words of the learner's. */
@Serializable
data class RehearsalSummary(
    val id: String,
    val course: String,
    val eventKind: String,
    val eventDate: String? = null,
    val status: String,
    val free: Boolean = false,
    val outcome: JsonElement? = null,
    val createdAt: String,
    val closedAt: String? = null,
    val runs: Int = 0,
    val stagesDone: Int = 0,
    val corrections: Int = 0,
) {
    val kind: EventKind get() = EventKind.fromWire(eventKind) ?: EventKind.OTHER
}

@Serializable
data class RehearsalState(
    val active: Rehearsal? = null,
    /** Stage wire value to "todo" or "done"; null with no active rehearsal. */
    val progress: Map<String, String>? = null,
    val nextStage: String? = null,
    /** The active rehearsal's finished runs, oldest first. An older server has none: an empty list. */
    val runs: List<RunMemory> = emptyList(),
    val history: List<RehearsalSummary> = emptyList(),
    /** True while the account's one free rehearsal has not been used. */
    val freeAvailable: Boolean = false,
    /** The active rehearsal has a finished hard-mode run ("Hard mode done"). An older server omits it: false. */
    val hardModeDone: Boolean = false,
    /** Hector (Pro): true Pro, false not Pro, null "could not tell" (the run's own start decides). An older server omits it: null. */
    val hectorAvailable: Boolean? = null,
) {
    val next: Stage? get() = Stage.fromWire(nextStage)

    fun isDone(stage: Stage): Boolean = progress?.get(stage.wire) == "done"

    fun doneCount(): Int = Stage.entries.count { isDone(it) }

    /** The newest finished run of a stage (the debrief's source), or null. */
    fun latestRun(stage: Stage): RunMemory? = runs.filter { it.stage == stage.wire }.maxByOrNull { it.finishedAt }
}

/** One stage of a quick-start as the server describes it: the wire key and what the stage is for. */
@Serializable data class PresetStage(val key: String = "", val goal: String = "")

/** A key phrase of a quick-start with what it means (shown for ready-made rehearsals only). */
@Serializable data class PresetPhrase(val text: String = "", val meaning: String = "")

/**
 * A ready-made rehearsal from GET /api/rehearsal-presets. Every word is the server's: the app holds no preset content, only
 * the shape. Unknown keys are ignored, and a stage key a newer server adds is kept as a plain string.
 */
@Serializable
data class RehearsalPreset(
    val id: String = "",
    val eventKind: String = "",
    val title: String = "",
    val blurb: String = "",
    val counterpart: String = "",
    val stages: List<PresetStage> = emptyList(),
    val keyPhrases: List<PresetPhrase> = emptyList(),
)

object RehearsalDecoding {
    /** `{ presets: [...] }`, in the server's order. A preset without an id or a title is dropped; no list at all is null. */
    fun presets(text: String): List<RehearsalPreset>? = runCatching {
        val root = ContentJson.json.parseToJsonElement(text).jsonObject
        root.getValue("presets").jsonArray.mapNotNull {
            runCatching { ContentJson.json.decodeFromJsonElement(RehearsalPreset.serializer(), it) }.getOrNull()
        }.filter { it.id.isNotBlank() && it.title.isNotBlank() }
    }.getOrNull()

    /** Checks the shape the screens read, like the web's parseRehearsalState. Anything that is not a state is null. */
    fun state(text: String): RehearsalState? {
        val root = runCatching { ContentJson.json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
        if (!root.containsKey("active")) return null
        if (runCatching { root["history"]?.jsonArray }.getOrNull() == null) return null
        if (runCatching { (root["freeAvailable"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull }.getOrNull() == null) return null
        // The two Hector fields are read the web's way: anything but a real boolean is "unknown" (null) or false, never a failure.
        val lenient = buildJsonObject {
            root.forEach { (k, v) -> if (k != "hectorAvailable" && k != "hardModeDone") put(k, v) }
            put("hardModeDone", (root["hardModeDone"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true)
            put("hectorAvailable", (root["hectorAvailable"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull)
        }
        return runCatching { ContentJson.json.decodeFromJsonElement(RehearsalState.serializer(), lenient) }.getOrNull()
    }

    /** `{ rehearsal }` from create, adjust, cancel and outcome. */
    fun rehearsal(text: String): Rehearsal? = runCatching {
        val root = ContentJson.json.parseToJsonElement(text).jsonObject
        ContentJson.json.decodeFromJsonElement(Rehearsal.serializer(), root.getValue("rehearsal"))
    }.getOrNull()

    /** The error code in a refused answer (`{ "error": "paywall" }`), if any. */
    fun errorCode(text: String): String? = runCatching {
        ContentJson.json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull
    }.getOrNull()
}

/** What a refused request means to the learner; the screens turn each into words ([RehearsalCopy.errorText]). */
enum class RehearsalError { PAYWALL, RETRY, BLOCKED_TEXT, ACTIVE_EXISTS, CLOSED, NOT_FOUND, NOT_ENABLED, INVALID, INVALID_PRESET, CONSENT, FAILED;

    companion object {
        /** The same table as the web's errorOf: the status says most of it, the code tells a few apart. */
        fun of(status: Int, code: String?): RehearsalError = when (status) {
            402 -> PAYWALL
            503 -> RETRY
            409 -> if (code == "closed") CLOSED else ACTIVE_EXISTS
            404 -> if (code == "not_enabled") NOT_ENABLED else NOT_FOUND
            403 -> CONSENT
            400 -> when (code) { "blocked_text" -> BLOCKED_TEXT; "invalid_preset" -> INVALID_PRESET; else -> INVALID }
            else -> FAILED
        }
    }
}

sealed interface RehearsalResult<out T> {
    data class Ok<T>(val value: T) : RehearsalResult<T>
    data class Failed(val error: RehearsalError) : RehearsalResult<Nothing>
}

/** "How did it go?": taps only. */
enum class OutcomeChoice(val wire: String) { WELL("well"), OK("ok"), HARD("hard"), MOVED("moved") }

/** The three intake answers' limits, and the one place that says whether an intake can be sent. */
data class RehearsalIntake(
    val course: String,
    val eventKind: EventKind,
    /** YYYY-MM-DD, or null for "not sure yet". */
    val eventDate: String?,
    val counterpart: String,
    val worries: String?,
) {
    /** The POST body for create or adjust (without the action and id, which the client adds). */
    fun toJson(): JsonObject = buildJsonObject {
        put("course", course)
        put("eventKind", eventKind.wire)
        put("eventDate", eventDate)
        put("counterpart", counterpart)
        put("worries", worries)
    }
}

sealed interface IntakeCheck {
    data class Valid(val intake: RehearsalIntake) : IntakeCheck
    data class Invalid(val reason: Reason) : IntakeCheck

    enum class Reason { KIND_REQUIRED, DATE_INVALID, COUNTERPART_REQUIRED, COUNTERPART_TOO_LONG, WORRIES_TOO_LONG }
}

object RehearsalRules {
    /** Same as the server's validateIntake: kind required, date optional, who 1 to 200 characters, worries 0 to 200. */
    fun validate(course: String, kind: EventKind?, date: String?, counterpart: String, worries: String): IntakeCheck {
        if (kind == null) return IntakeCheck.Invalid(IntakeCheck.Reason.KIND_REQUIRED)
        val day = date?.trim()?.takeIf { it.isNotEmpty() }
        if (day != null && !isCalendarDate(day)) return IntakeCheck.Invalid(IntakeCheck.Reason.DATE_INVALID)
        val who = counterpart.trim()
        if (who.isEmpty()) return IntakeCheck.Invalid(IntakeCheck.Reason.COUNTERPART_REQUIRED)
        if (who.length > INTAKE_TEXT_MAX) return IntakeCheck.Invalid(IntakeCheck.Reason.COUNTERPART_TOO_LONG)
        val worry = worries.trim()
        if (worry.length > INTAKE_TEXT_MAX) return IntakeCheck.Invalid(IntakeCheck.Reason.WORRIES_TOO_LONG)
        return IntakeCheck.Valid(RehearsalIntake(course, kind, day, who, worry.ifEmpty { null }))
    }

    private val DATE = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$")

    /** A real calendar day written YYYY-MM-DD ("2026-02-30" is not one). */
    fun isCalendarDate(v: String): Boolean {
        if (!DATE.matches(v)) return false
        return runCatching { LocalDate.parse(v).toString() == v }.getOrDefault(false)
    }

    /** The move-to-a-new-date outcome needs a day AFTER today (the learner's own day). */
    fun isFutureDay(v: String, today: LocalDate): Boolean = isCalendarDate(v) && LocalDate.parse(v).isAfter(today)

    /** Whole days from [today] to the event; negative once it has passed. Null without a date. */
    fun daysToGo(eventDate: String?, today: LocalDate): Int? {
        if (eventDate == null || !isCalendarDate(eventDate)) return null
        return ChronoUnit.DAYS.between(today, LocalDate.parse(eventDate)).toInt()
    }
}

/** A pinned path item: the next stage, the event-day warm-up, or "How did it go?". Kept apart from Today's plan. */
@Serializable
data class PinnedItem(
    /** "stage", "warmup_today" or "followup"; anything else a newer server adds is drawn as nothing. */
    val kind: String,
    val rehearsalId: String,
    val stage: String? = null,
    val title: String,
    val subtitle: String,
    val minutes: Int = 0,
    val hero: Boolean = false,
    /** The rehearsal's event kind (the hero says "Interview today"); an unknown or missing value is null. */
    val eventKind: String? = null,
) {
    val kindOrNull: EventKind? get() = EventKind.fromWire(eventKind)
    val stageOrNull: Stage? get() = Stage.fromWire(stage)
    val isFollowUp: Boolean get() = kind == "followup"
    val isKnown: Boolean get() = kind == "stage" || kind == "warmup_today" || kind == "followup"
}

/** Where a call's conversation partner comes from (src/lib/call-source.ts). */
sealed interface CallSource {
    /** A scenario sends its own system prompt. */
    data object Scenario : CallSource

    /** A rehearsal sends only its id and stage: the server builds the prompt from the stored brief and the earlier runs. */
    data class Rehearsal(
        val id: String,
        val stage: Stage,
        /** Who plays the partner (Hector is Pro). Alphonso, at the normal level, sends nothing extra. */
        val partner: RehearsalPartner = RehearsalPartner.ALPHONSO,
        /** Hard mode: Hector on the last stage only. Sent on every turn of the call, with the same value. */
        val hardMode: Boolean = false,
    ) : CallSource
}

/** The /api/chat body for one reply of a call (the web's chatRequestBody). */
object ChatRequestBody {
    fun build(
        source: CallSource,
        systemPrompt: String?,
        cefrLevel: String?,
        course: String?,
        callId: String?,
        messages: List<Pair<String, String>>,
    ): JsonObject = buildJsonObject {
        put("messages", kotlinx.serialization.json.buildJsonArray {
            messages.forEach { (role, content) -> add(buildJsonObject { put("role", role); put("content", content) }) }
        })
        // The key order is the scenario body's original one (systemPrompt, cefrLevel, course, callId): pinned by the chat client tests.
        when (source) {
            is CallSource.Rehearsal -> put("rehearsal", buildJsonObject {
                put("id", source.id); put("stage", source.stage.wire)
                // Alphonso's body is exactly what it was before Hector rehearsals. For Hector, every turn of the call carries the
                // same two values (the server binds them to the call on its first turn); hardMode only where it can exist.
                if (source.partner == RehearsalPartner.HECTOR) {
                    put("persona", source.partner.wire)
                    if (source.hardMode && source.stage == Stage.HARD_MOMENTS) put("hardMode", true)
                }
            })
            CallSource.Scenario -> if (systemPrompt != null) put("systemPrompt", systemPrompt)
        }
        if (cefrLevel != null) put("cefrLevel", cefrLevel)
        if (source == CallSource.Scenario && course != null) put("course", course)
        if (callId != null) put("callId", callId)
    }
}

/** Who plays the other person in a rehearsal stage. Alphonso is for everyone; Hector is Pro. */
enum class RehearsalPartner(val wire: String, val displayName: String) {
    ALPHONSO("alphonso", "Alphonso"),
    HECTOR("hector", "Hector");

    companion object {
        fun fromWire(raw: String?): RehearsalPartner = entries.firstOrNull { it.wire == raw } ?: ALPHONSO
    }
}

/**
 * The partner sheet shown at the start of EACH stage (pick 5B): the rules of what it offers and where each choice goes.
 * `hectorAvailable` is the server's answer: true is Pro, false is not (the Pro badge and the paywall), null is "could not
 * tell", which lets the learner try (the run's start checks Pro once and a refusal there explains itself).
 */
object StagePartnerRules {
    /**
     * A Pro badge on Hector, and the paywall behind him. Only a definite false from the server, and only while the app does not
     * know the learner is Pro: the state can be older than a purchase just made, and unknown lets the learner try.
     */
    fun hectorLocked(hectorAvailable: Boolean?, isPro: Boolean): Boolean = hectorAvailable == false && !isPro

    /** The Hard mode toggle: the last stage, and only where Hector is not locked. */
    fun hardModeOffered(stage: Stage, hectorAvailable: Boolean?, isPro: Boolean): Boolean = stage == Stage.HARD_MOMENTS && !hectorLocked(hectorAvailable, isPro)

    sealed interface Choice {
        /** Start the call with this partner; [hardMode] is only ever true for Hector on the last stage. */
        data class Start(val partner: RehearsalPartner, val hardMode: Boolean) : Choice
        /** Hector, and the learner is not Pro: the existing Pro screen opens. */
        data object Paywall : Choice
    }

    fun alphonso(): Choice = Choice.Start(RehearsalPartner.ALPHONSO, false)

    /** The Hector button. [hardRequested] is the toggle; it counts only where it is offered. */
    fun hector(stage: Stage, hectorAvailable: Boolean?, isPro: Boolean, hardRequested: Boolean): Choice =
        if (hectorLocked(hectorAvailable, isPro)) Choice.Paywall
        else Choice.Start(RehearsalPartner.HECTOR, hardRequested && hardModeOffered(stage, hectorAvailable, isPro))

    fun hectorButton(stage: Stage, hectorAvailable: Boolean?, isPro: Boolean, hardMode: Boolean): String = when {
        hectorLocked(hectorAvailable, isPro) -> "Start with Hector (Pro)"
        hardMode && stage == Stage.HARD_MOMENTS -> "Start hard mode with Hector"
        else -> "Start with Hector"
    }

    const val ALPHONSO_BUTTON = "Start with Alphonso"
    const val SUBTITLE = "Who do you want to practise with?"
    const val HECTOR_LINE = "A tougher, more realistic partner, and a longer debrief at the end."
    const val HARD_MODE_TITLE = "Hard mode."
    const val HARD_MODE_LINE = "Faster, with interruptions and surprise questions. Still inside your plan, and still kind."
    const val NOT_NOW = "Not now"
    const val PRO_BADGE = "Pro"
    const val PRO_BADGE_DESCRIPTION = "Hector is part of Alphonso Pro"
    const val HARD_MODE_DONE = "Hard mode done"
}

/**
 * What a refused /api/chat turn of a rehearsal means (the contract's chatErrors). A 402 `pro_required` (Hector or hard mode
 * without Pro) opens the Pro screen; a 402 `free_runs_used` is the free rehearsal's own limit and keeps its own words.
 */
enum class RehearsalChatRefusal {
    PRO_REQUIRED, FREE_RUNS_USED, INVALID_MODE, RETRY, NOT_FOUND, CLOSED, OTHER;

    companion object {
        fun of(status: Int, code: String?): RehearsalChatRefusal = when {
            status == 402 && code == "pro_required" -> PRO_REQUIRED
            status == 402 -> FREE_RUNS_USED
            status == 400 && code == "invalid_mode" -> INVALID_MODE
            status == 503 -> RETRY
            status == 404 -> NOT_FOUND
            status == 409 && code == "rehearsal_closed" -> CLOSED
            else -> OTHER
        }

        fun of(e: Throwable): RehearsalChatRefusal =
            (e as? com.obsidianmedia.learnwithalphonso.core.net.AiConversationError.Server)?.let { of(it.status, it.code) } ?: OTHER

        /** The words under the call: pro_required and free_runs_used are the web's; every other refusal keeps the shared AI error words. */
        fun message(e: Throwable): String = when (of(e)) {
            PRO_REQUIRED -> "Hector rehearsals are part of Alphonso Pro. You can start this stage with Alphonso instead."
            FREE_RUNS_USED -> "You have used all the runs of your free rehearsal. More rehearsals are part of Alphonso Pro."
            else -> com.obsidianmedia.learnwithalphonso.core.net.AiErrorCopy.userMessage(e)
        }
    }
}

/** The quick-start picker's fixed words; the preset cards' own words come from the server. */
object PresetCopy {
    const val PICKER_TITLE = "Rehearse a real conversation"
    const val PICKER_LINE = "Pick what is coming up. Alphonso plays the other person."
    const val SOMETHING_ELSE = "Something else"
    const val SOMETHING_ELSE_BLURB = "Answer four short questions and get a plan made for you."
    const val LIST_FAILED = "We could not load the ready-made rehearsals. You can still make your own, or try again."
    const val RETRY = "Try again"
    const val LOADING = "Loading…"
    const val ADD_DATE = "Add a date"
    const val NO_DATE = "No date"
    const val NO_DATE_HINT = "No day chosen yet. Pick one below, or start without a date."
    const val START_NOW = "Start now"
    const val PERSONALISE = "Personalise"
    const val STAGES_TITLE = "Three stages"
    const val PREVIEW_NOTE = "Ready to go: no questions to answer. You can add a date or change the plan later."

    /** "With a hiring manager". */
    fun withLine(counterpart: String): String = "With $counterpart"

    /** The label of a stage key; a key a newer server adds is shown as the server wrote it. */
    fun stageLabel(key: String): String = Stage.fromWire(key)?.label ?: key
}

/** What the Learn entry does for this learner . */
enum class RehearsalEntry {
    /** An active rehearsal: open its plan. */
    PLAN,
    /** Nothing active and a rehearsal may be made: open the intake. */
    INTAKE,
    /** Not Pro, the free rehearsal is used and none is active: the paywall sheet. */
    PAYWALL;

    companion object {
        fun decide(state: RehearsalState, isPro: Boolean): RehearsalEntry = when {
            state.active != null -> PLAN
            isPro || state.freeAvailable -> INTAKE
            else -> PAYWALL
        }
    }
}

/** The words of Rehearsals: the web's src/lib/rehearsal-copy.ts and the rules' screen text, word for word. */
object RehearsalCopy {
    fun errorText(error: RehearsalError): String = when (error) {
        RehearsalError.PAYWALL -> "You have used your free rehearsal. More rehearsals are part of Alphonso Pro, and your first one stays here to look back on."
        RehearsalError.RETRY -> "We could not check your plan just now. Please try again in a moment."
        RehearsalError.BLOCKED_TEXT -> "Some of those words can't be used here. Please rephrase and try again."
        RehearsalError.ACTIVE_EXISTS -> "You already have a rehearsal going for this course."
        RehearsalError.CLOSED -> "This rehearsal is already finished."
        RehearsalError.NOT_FOUND -> "We could not find that rehearsal."
        RehearsalError.NOT_ENABLED -> "Rehearsals are not available yet."
        RehearsalError.INVALID -> "Please check your answers and try again."
        RehearsalError.INVALID_PRESET -> "That quick start is not available. Please pick another one."
        RehearsalError.CONSENT -> "Turn on AI features to prepare a rehearsal."
        RehearsalError.FAILED -> "Something went wrong. Please try again."
    }

    /** The AI label next to the tutor's name wherever he plays the other person. */
    const val AI_LABEL = "AI"

    const val ENTRY_TITLE = "Rehearse"
    const val ENTRY_VALUE = "a real talk"
    const val PLAN_FOOTER = "Alphonso is an AI. He remembers what happened on each run and opens the next one with it. There is no readiness score."
    const val DEBRIEF_FOOTER = "Written by Alphonso, an AI, from this conversation. It can be wrong. Nothing here is a score."
    const val OUTCOME_FOOTER = "Just a tap. No words are stored. You can delete this rehearsal any time."
    const val PRIVACY_LINE = "No need for real names. Say “my manager” or “the landlord”. What you write here is only used to build your rehearsal, and you can delete it any time."
    const val STAGE_DONE = "Done · you can repeat it"

    /** The Learn rail card's value: "a real talk", or "<Event> · <date>" once a rehearsal is active. */
    fun entryValue(active: Rehearsal?): String = if (active == null) ENTRY_VALUE else "${active.kind.label} · ${dateLabel(active.eventDate) ?: "No date"}"

    fun entryTitle(active: Rehearsal?): String = if (active == null) ENTRY_TITLE else "Rehearsal"

    /** "Tue 1 Dec": the day as the plan screen says it. */
    fun dateLabel(date: String?): String? {
        if (date == null || !RehearsalRules.isCalendarDate(date)) return null
        val d = LocalDate.parse(date)
        val dow = d.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH)
        val month = d.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH)
        return "$dow ${d.dayOfMonth} $month"
    }

    /** "Tue 1 Dec · 5 days to go" (or "Today", "Tomorrow", or just the date once it has passed). */
    fun whenLine(eventDate: String?, today: LocalDate): String {
        val label = dateLabel(eventDate) ?: return "Date not set yet"
        val days = RehearsalRules.daysToGo(eventDate, today) ?: return label
        return "$label · ${daysToGoText(days)}"
    }

    /** The web's daysToGoText (src/lib/rehearsal-dates.ts). */
    fun daysToGoText(n: Int): String = when {
        n == 0 -> "Today"
        n == 1 -> "1 day to go"
        n > 1 -> "$n days to go"
        n == -1 -> "It was yesterday"
        else -> "${-n} days ago"
    }

    /** The event-day hero: "Interview today", then the fixed lines. */
    fun heroOverline(kind: EventKind?): String = "${(kind?.short ?: "rehearsal").replaceFirstChar { it.uppercase() }} today"
    const val HERO_TITLE = "2-minute warm-up"
    const val HERO_LINE = "Say the key phrases once more before you go"
    const val HERO_BUTTON = "Start 2 minutes"
    const val FOLLOW_UP_TITLE = "How did it go?"
    const val MOVE_PROMPT = "When is it now?"
    const val MOVE_NOTE = "Your rehearsal continues. Stage 2 comes back before the new date."
    const val CLOSE_BUTTON = "It didn’t happen, close the rehearsal"
    const val PICK_DAY = "Pick the new day"

    fun withLine(rehearsal: Rehearsal): String = "With ${rehearsal.counterpart}"

    fun stageRowSubtitle(stage: Stage, done: Boolean): String =
        if (done) STAGE_DONE else "${stage.blurb} · about ${stage.minutes} min"

    fun nextButton(stage: Stage): String = "Next: ${stage.label}"

    /** The call header: the event as the title, the stage under the tutor's name. */
    fun callTitle(kind: EventKind): String = "${kind.short.replaceFirstChar { it.uppercase() }} rehearsal"

    fun callSubline(stage: Stage, partner: RehearsalPartner = RehearsalPartner.ALPHONSO, hardMode: Boolean = false): String =
        "${partner.displayName} · Stage ${stage.number} of 3: ${stage.label}${if (hardMode && partner == RehearsalPartner.HECTOR) " · Hard mode" else ""}"

    fun debriefStageLine(stage: Stage): String = "Stage ${stage.number} · ${stage.label}"

    fun debriefHeadline(kind: EventKind, stage: Stage): String = when (stage) {
        Stage.WARMUP -> "That was your warm-up"
        Stage.CONVERSATION -> "That was a full ${kind.short}"
        Stage.HARD_MOMENTS -> "That was the hard moments"
    }

    /** "9 minutes · 14 turns"; singular forms for one. */
    fun debriefStats(seconds: Int, turns: Int): String {
        val minutes = maxOf(1, (seconds + 30) / 60)
        return "$minutes ${if (minutes == 1) "minute" else "minutes"} · $turns ${if (turns == 1) "turn" else "turns"}"
    }

    /** "Added to Fix before it sticks: N items". Null when the recap kept nothing. */
    fun fixLine(count: Int): String? = if (count <= 0) null else "Added to Fix before it sticks: $count ${if (count == 1) "item" else "items"}"

    /** The way out of the how-did-it-go screen, by outcome, as the screen's rows say it. */
    fun outcomeRowTitle(choice: OutcomeChoice): String = when (choice) {
        OutcomeChoice.WELL -> "Went well"
        OutcomeChoice.OK -> "OK"
        OutcomeChoice.HARD -> "It was hard"
        OutcomeChoice.MOVED -> "It didn’t happen / moved"
    }

    fun outcomeRowDetail(choice: OutcomeChoice): String? = when (choice) {
        OutcomeChoice.HARD -> "Alphonso can help you practise those parts"
        OutcomeChoice.MOVED -> "You can set a new date"
        else -> null
    }

    fun moveButton(newDate: String?): String = if (newDate == null) PICK_DAY else "Move my rehearsal to ${dateLabel(newDate) ?: newDate}"

    /** "4 Dec". */
    fun shortDate(date: String?): String? {
        if (date == null || !RehearsalRules.isCalendarDate(date)) return null
        val d = LocalDate.parse(date)
        return "${d.dayOfMonth} ${d.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH)}"
    }

    const val PAYWALL_TITLE = "Rehearsals are part of Pro"
    const val PAYWALL_SUBTITLE = "You have used your free rehearsal"
    const val PAYWALL_STAYS_1 = "Your plan and run history stay readable."
    const val PAYWALL_STAYS_2 = "Recaps and Alphonso’s memory stay free."
    const val PAYWALL_PRICE_NOTE = "The price is shown by the store before you pay. You can cancel any time in your store settings."

    /** What the learner already did, named from their latest closed rehearsal; a neutral line when there is none. */
    fun paywallBody(latest: RehearsalSummary?): String {
        val tail = "A new rehearsal, for a meeting, a landlord or a first day, needs Pro."
        if (latest == null || latest.runs == 0) return "You have used your free rehearsal with Alphonso (AI). A new rehearsal needs Pro."
        val parts = buildList {
            add(if (latest.stagesDone >= 3) "all 3 stages" else "${latest.stagesDone} of 3 stages")
            add(count(latest.runs, "run"))
            if (latest.corrections > 0) add("${count(latest.corrections, "mistake")} sent to Fix before it sticks")
        }
        val list = if (parts.size == 3) "${parts[0]}, ${parts[1]}, and ${parts[2]}" else "${parts[0]} and ${parts[1]}"
        return "You rehearsed your ${latest.kind.short} with Alphonso (AI): $list. $tail"
    }

    private fun count(n: Int, noun: String) = "$n $noun${if (n == 1) "" else "s"}"
}
