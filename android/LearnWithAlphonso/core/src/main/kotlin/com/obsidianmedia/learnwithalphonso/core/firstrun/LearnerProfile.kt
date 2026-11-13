package com.obsidianmedia.learnwithalphonso.core.firstrun

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add
import java.time.OffsetDateTime

/**
 * The learner's first-run answers (visual round 6, part 3), the same contract as the web's src/lib/learner-profile.ts
 * and the iOS Kit's LearnerProfile.swift: kept on the account in auth `user_metadata.learner_profile`, written only
 * through the server's checked save (/api/learner-profile), read back field by field so one bad value drops only
 * itself. An age RANGE only, never a birth date; there is no under-13 range here at all (the block stays on the
 * device, FirstRun.kt). The lists must match the web's exactly (src/lib/learner-profile-native-parity.test.ts).
 */
object LearnerProfileLists {
    const val METADATA_KEY = "learner_profile"

    val ageRanges = listOf("13-17", "18-24", "25-34", "35-54", "55+")
    val goals = listOf("travel", "work", "school", "family", "exam", "fun")
    val levels = listOf("new", "some", "confident")
    val dailyMinutes = listOf(5, 10, 15, 20)
    val interests = listOf("food", "travel", "sport", "music", "movies", "business", "tech", "nature", "art", "family")
    val heardFrom = listOf("app_store", "search", "youtube", "social", "friend", "podcast")
    val courses = listOf("en", "fr", "es")

    /** How "Explain in my language" appears (src/lib/explain.ts EXPLAIN_MODES); absent on the account means "tap". */
    val explainModes = listOf("tap", "always", "off")

    /** ISO 639-1 codes for the "I speak" picker; names come from the system (Locale). */
    val nativeLanguages = listOf(
        "en", "es", "fr", "pt", "de", "it", "nl", "ar", "fa", "tr", "ru", "uk", "pl", "ro",
        "el", "he", "hi", "bn", "ur", "pa", "ta", "te", "mr", "gu", "zh", "ja", "ko", "vi",
        "th", "id", "ms", "tl", "sw", "am", "yo", "ha", "ig", "zu", "sv", "no", "da", "fi",
        "cs", "sk", "hu", "bg", "sr", "hr", "ca", "eu", "gl", "ku", "ps", "ne", "si", "km",
        "my", "so",
    )

    /** ISO 3166-1 alpha-2, the same two letters profiles.country requires. */
    val countries = listOf(
        "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW",
        "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN",
        "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG",
        "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
        "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI",
        "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
        "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR",
        "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
        "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA",
        "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
        "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU",
        "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP",
        "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR",
        "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD",
        "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
        "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
        "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE",
        "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
    )
}

/** The answers, on the device (the first-run draft) or read back from the account. Every field is optional. */
@Serializable
data class LearnerAnswers(
    val name: String? = null,
    val course: String? = null,
    val nativeLanguage: String? = null,
    val explainMode: String? = null,
    val country: String? = null,
    val showFlag: Boolean? = null,
    val goal: String? = null,
    val level: String? = null,
    val dailyMinutes: Int? = null,
    val ageRange: String? = null,
    val interests: List<String>? = null,
    val heardFrom: String? = null,
) {
    /** The JSON patch the server accepts: only the keys that are set. */
    fun jsonPatch(): JsonObject = buildJsonObject {
        name?.let { put("name", it) }
        course?.let { put("course", it) }
        nativeLanguage?.let { put("nativeLanguage", it) }
        explainMode?.let { put("explainMode", it) }
        country?.let { put("country", it) }
        showFlag?.let { put("showFlag", it) }
        goal?.let { put("goal", it) }
        level?.let { put("level", it) }
        dailyMinutes?.let { put("dailyMinutes", it) }
        ageRange?.let { put("ageRange", it) }
        interests?.let { list -> putJsonArray("interests") { list.forEach { add(it) } } }
        heardFrom?.let { put("heardFrom", it) }
    }

    val isEmpty: Boolean get() = jsonPatch().isEmpty()

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun encode(answers: LearnerAnswers): String = json.encodeToString(serializer(), answers)
        fun decode(text: String): LearnerAnswers? = runCatching { json.decodeFromString(serializer(), text) }.getOrNull()

        /** Trimmed, 1 to 40 characters, or null (the server's nameSchema). */
        fun cleanName(raw: String): String? = raw.trim().takeIf { it.isNotEmpty() && it.length <= 40 }

        /** Field by field against the server's lists: a value off a list is dropped, the rest kept. */
        fun parse(raw: JsonElement?): LearnerAnswers {
            val v = raw as? JsonObject ?: return LearnerAnswers()
            fun str(key: String): String? = (v[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
            fun pick(key: String, list: List<String>): String? = str(key)?.takeIf { it in list }
            val minutes = (v["dailyMinutes"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
            return LearnerAnswers(
                name = str("name")?.let(::cleanName),
                course = pick("course", LearnerProfileLists.courses),
                nativeLanguage = pick("nativeLanguage", LearnerProfileLists.nativeLanguages),
                explainMode = pick("explainMode", LearnerProfileLists.explainModes),
                country = pick("country", LearnerProfileLists.countries),
                showFlag = (v["showFlag"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull,
                goal = pick("goal", LearnerProfileLists.goals),
                level = pick("level", LearnerProfileLists.levels),
                dailyMinutes = minutes?.takeIf { it in LearnerProfileLists.dailyMinutes },
                ageRange = pick("ageRange", LearnerProfileLists.ageRanges),
                interests = (v["interests"] as? JsonArray)?.mapNotNull { e ->
                    (e as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.takeIf { it in LearnerProfileLists.interests }
                },
                heardFrom = pick("heardFrom", LearnerProfileLists.heardFrom),
            )
        }
    }
}

/** The answers on the account, with the one-time flow's marks. */
data class LearnerProfile(
    val answers: LearnerAnswers = LearnerAnswers(),
    val completedAt: String? = null,
    val dismissedAt: String? = null,
) {
    /** "Complete your profile" shows once: until the learner finishes it or says Not now. */
    val needsCompleteProfile: Boolean get() = completedAt == null && dismissedAt == null

    companion object {
        fun parse(raw: JsonElement?): LearnerProfile {
            val v = raw as? JsonObject ?: JsonObject(emptyMap())
            fun time(key: String): String? = (v[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
                ?.takeIf { it.length <= 40 && runCatching { OffsetDateTime.parse(it) }.isSuccess }
            // On the account the flag is a plain yes/no: anything but true is off.
            val answers = LearnerAnswers.parse(v).copy(showFlag = (v["showFlag"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true)
            return LearnerProfile(answers, time("completedAt"), time("dismissedAt"))
        }
    }
}
