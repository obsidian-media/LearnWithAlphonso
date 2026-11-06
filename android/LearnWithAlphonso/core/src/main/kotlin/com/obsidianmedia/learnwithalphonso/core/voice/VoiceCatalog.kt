package com.obsidianmedia.learnwithalphonso.core.voice

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Mirror of src/lib/voice-catalog.ts: the Deepgram Aura-2 voices a learner may choose for Alphonso and for Hector,
 * per course, and each character's default. The server re-checks every voice against its own copy, so this list only
 * decides what the Settings picker offers. src/lib/voice-catalog-parity.test.ts fails when the two drift.
 */
enum class VoiceCharacter(val wire: String, val settingsLabel: String) {
    Alphonso("alphonso", "Alphonso's voice"),
    Hector("hector", "Hector's voice"),
}

enum class VoiceGender(val groupLabel: String) { Male("Male"), Female("Female") }

data class VoiceOption(
    val id: String,
    val course: String,
    val name: String,
    val gender: VoiceGender,
    val accent: String,
    val descriptor: String,
)

object VoiceCatalog {
    val courses = listOf("en", "fr", "es")

    /** Defaults per character and course (owner, 2026-11-06). Keep in step with DEFAULT_VOICES on the web. */
    val defaults: Map<VoiceCharacter, Map<String, String>> = mapOf(
        VoiceCharacter.Alphonso to mapOf("en" to "aura-2-saturn-en", "es" to "aura-2-javier-es", "fr" to "aura-2-hector-fr"),
        VoiceCharacter.Hector to mapOf("en" to "aura-2-hermes-en", "es" to "aura-2-alvaro-es", "fr" to "aura-2-hector-fr"),
    )

    val all: List<VoiceOption> = listOf(
        VoiceOption("aura-2-andromeda-en", "en", "Andromeda", VoiceGender.Female, "American", "Casual, expressive"),
        VoiceOption("aura-2-apollo-en", "en", "Apollo", VoiceGender.Male, "American", "Confident, comfortable"),
        VoiceOption("aura-2-arcas-en", "en", "Arcas", VoiceGender.Male, "American", "Natural, smooth"),
        VoiceOption("aura-2-aries-en", "en", "Aries", VoiceGender.Male, "American", "Warm, energetic"),
        VoiceOption("aura-2-asteria-en", "en", "Asteria", VoiceGender.Female, "American", "Clear, confident"),
        VoiceOption("aura-2-athena-en", "en", "Athena", VoiceGender.Female, "American", "Calm, smooth"),
        VoiceOption("aura-2-atlas-en", "en", "Atlas", VoiceGender.Male, "American", "Enthusiastic, confident"),
        VoiceOption("aura-2-aurora-en", "en", "Aurora", VoiceGender.Female, "American", "Cheerful, expressive"),
        VoiceOption("aura-2-callista-en", "en", "Callista", VoiceGender.Female, "American", "Clear, energetic"),
        VoiceOption("aura-2-cora-en", "en", "Cora", VoiceGender.Female, "American", "Smooth, melodic"),
        VoiceOption("aura-2-cordelia-en", "en", "Cordelia", VoiceGender.Female, "American", "Approachable, warm"),
        VoiceOption("aura-2-delia-en", "en", "Delia", VoiceGender.Female, "American", "Casual, friendly"),
        VoiceOption("aura-2-draco-en", "en", "Draco", VoiceGender.Male, "British", "Warm, approachable"),
        VoiceOption("aura-2-electra-en", "en", "Electra", VoiceGender.Female, "American", "Professional, engaging"),
        VoiceOption("aura-2-helena-en", "en", "Helena", VoiceGender.Female, "American", "Caring, natural"),
        VoiceOption("aura-2-hera-en", "en", "Hera", VoiceGender.Female, "American", "Smooth, warm"),
        VoiceOption("aura-2-hermes-en", "en", "Hermes", VoiceGender.Male, "American", "Expressive, engaging"),
        VoiceOption("aura-2-hyperion-en", "en", "Hyperion", VoiceGender.Male, "Australian", "Caring, warm"),
        VoiceOption("aura-2-iris-en", "en", "Iris", VoiceGender.Female, "American", "Cheerful, positive"),
        VoiceOption("aura-2-juno-en", "en", "Juno", VoiceGender.Female, "American", "Natural, engaging"),
        VoiceOption("aura-2-jupiter-en", "en", "Jupiter", VoiceGender.Male, "American", "Expressive, knowledgeable"),
        VoiceOption("aura-2-luna-en", "en", "Luna", VoiceGender.Female, "American", "Friendly, natural"),
        VoiceOption("aura-2-mars-en", "en", "Mars", VoiceGender.Male, "American", "Smooth, patient"),
        VoiceOption("aura-2-neptune-en", "en", "Neptune", VoiceGender.Male, "American", "Professional, patient"),
        VoiceOption("aura-2-orpheus-en", "en", "Orpheus", VoiceGender.Male, "American", "Professional, clear"),
        VoiceOption("aura-2-pandora-en", "en", "Pandora", VoiceGender.Female, "British", "Smooth, calm"),
        VoiceOption("aura-2-phoebe-en", "en", "Phoebe", VoiceGender.Female, "American", "Energetic, warm"),
        VoiceOption("aura-2-pluto-en", "en", "Pluto", VoiceGender.Male, "American", "Smooth, calm"),
        VoiceOption("aura-2-saturn-en", "en", "Saturn", VoiceGender.Male, "American", "Knowledgeable, confident"),
        VoiceOption("aura-2-selene-en", "en", "Selene", VoiceGender.Female, "American", "Expressive, engaging"),
        VoiceOption("aura-2-thalia-en", "en", "Thalia", VoiceGender.Female, "American", "Clear, confident"),
        VoiceOption("aura-2-vesta-en", "en", "Vesta", VoiceGender.Female, "American", "Natural, expressive"),
        VoiceOption("aura-2-agustina-es", "es", "Agustina", VoiceGender.Female, "Spain", "Calm, clear"),
        VoiceOption("aura-2-alvaro-es", "es", "Alvaro", VoiceGender.Male, "Spain", "Calm, professional"),
        VoiceOption("aura-2-antonia-es", "es", "Antonia", VoiceGender.Female, "Argentine", "Approachable, enthusiastic"),
        VoiceOption("aura-2-aquila-es", "es", "Aquila", VoiceGender.Male, "Latin American", "Casual, comfortable"),
        VoiceOption("aura-2-carina-es", "es", "Carina", VoiceGender.Female, "Spain", "Professional, raspy"),
        VoiceOption("aura-2-celeste-es", "es", "Celeste", VoiceGender.Female, "Colombian", "Clear, energetic"),
        VoiceOption("aura-2-diana-es", "es", "Diana", VoiceGender.Female, "Spain", "Professional, confident"),
        VoiceOption("aura-2-gloria-es", "es", "Gloria", VoiceGender.Female, "Colombian", "Casual, clear"),
        VoiceOption("aura-2-javier-es", "es", "Javier", VoiceGender.Male, "Latin American", "Approachable, calm"),
        VoiceOption("aura-2-nestor-es", "es", "Nestor", VoiceGender.Male, "Spain", "Calm, professional"),
        VoiceOption("aura-2-olivia-es", "es", "Olivia", VoiceGender.Female, "Mexican", "Breathy, calm"),
        VoiceOption("aura-2-selena-es", "es", "Selena", VoiceGender.Female, "Latin American", "Approachable, calm"),
        VoiceOption("aura-2-silvia-es", "es", "Silvia", VoiceGender.Female, "Spain", "Charismatic, clear"),
        VoiceOption("aura-2-sirio-es", "es", "Sirio", VoiceGender.Male, "Mexican", "Breathy, confident"),
        VoiceOption("aura-2-valerio-es", "es", "Valerio", VoiceGender.Male, "Mexican", "Deep, knowledgeable"),
        VoiceOption("aura-2-agathe-fr", "fr", "Agathe", VoiceGender.Female, "French", "Charismatic, cheerful"),
        VoiceOption("aura-2-hector-fr", "fr", "Hector", VoiceGender.Male, "French", "Confident, empathetic"),
    )

    fun voicesFor(course: String): List<VoiceOption> = all.filter { it.course == course }

    fun find(id: String): VoiceOption? = all.firstOrNull { it.id == id }

    fun isAllowed(id: String?, course: String): Boolean = id != null && all.any { it.id == id && it.course == course }

    fun defaultVoice(character: VoiceCharacter, course: String): String =
        defaults.getValue(character)[course] ?: defaults.getValue(character).getValue("en")

    /** The static preview clip the web app serves (public/voices/). Previews never call TTS. */
    fun previewUrl(id: String, baseUrl: String): String = "${baseUrl.trimEnd('/')}/voices/$id.mp3"
}

/**
 * The learner's choices, per character and course, as stored on the account in auth `user_metadata.voices`
 * (`{"alphonso": {"en": "aura-2-..."}, "hector": {...}}`). Missing entries mean "the default".
 */
data class VoicePrefs(val choices: Map<VoiceCharacter, Map<String, String>> = emptyMap()) {
    fun voice(character: VoiceCharacter, course: String): String {
        val id = choices[character]?.get(course)
        return if (VoiceCatalog.isAllowed(id, course)) id!! else VoiceCatalog.defaultVoice(character, course)
    }

    /** Choosing the default removes the entry; a voice off the list changes nothing. */
    fun with(character: VoiceCharacter, course: String, id: String): VoicePrefs {
        if (!VoiceCatalog.isAllowed(id, course)) return this
        val perCourse = (choices[character] ?: emptyMap()).toMutableMap()
        if (id == VoiceCatalog.defaultVoice(character, course)) perCourse.remove(course) else perCourse[course] = id
        return VoicePrefs(if (perCourse.isEmpty()) choices - character else choices + (character to perCourse))
    }

    /** The JSON value saved under `user_metadata.voices`; both characters are always present. */
    fun toJson(): JsonObject = buildJsonObject {
        VoiceCharacter.entries.forEach { character ->
            putJsonObject(character.wire) { choices[character]?.forEach { (course, id) -> put(course, id) } }
        }
    }

    companion object {
        const val METADATA_KEY = "voices"

        /** Reads untrusted JSON (the metadata value), keeping only allow-listed voices for the right course. */
        fun fromJson(element: JsonElement?): VoicePrefs {
            val obj = element as? JsonObject ?: return VoicePrefs()
            val parsed = mutableMapOf<VoiceCharacter, Map<String, String>>()
            VoiceCharacter.entries.forEach { character ->
                val perCourse = obj[character.wire] as? JsonObject ?: return@forEach
                val kept = perCourse.mapNotNull { (course, value) ->
                    val id = (value as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
                    if (VoiceCatalog.isAllowed(id, course)) course to id!! else null
                }.toMap()
                if (kept.isNotEmpty()) parsed[character] = kept
            }
            return VoicePrefs(parsed)
        }
    }
}

/**
 * The device's cached copy of the account's choices, so a call picks its voice without waiting on the network, plus
 * the account round trip. `read`/`write` are the cache (SharedPreferences in the app); `fetch`/`save` are the account
 * (SessionManager). Account-scoped: the app clears it on sign-out and hydrates it at sign-in.
 */
class VoicePrefsStore(
    private val read: () -> String?,
    private val write: (String?) -> Unit,
    private val fetch: suspend () -> VoicePrefs?,
    private val save: suspend (VoicePrefs) -> Unit,
) {
    fun load(): VoicePrefs =
        read()?.let { raw -> runCatching { VoicePrefs.fromJson(kotlinx.serialization.json.Json.parseToJsonElement(raw)) }.getOrNull() }
            ?: VoicePrefs()

    fun voice(character: VoiceCharacter, course: String): String = load().voice(character, course)

    /** Pulls the account's choices into the cache; a failed read keeps the cache. */
    suspend fun hydrate(): VoicePrefs {
        fetch()?.let { write(it.toJson().toString()) }
        return load()
    }

    /** Saves one choice to the account, then the cache. Throws without changing either on failure. */
    suspend fun choose(character: VoiceCharacter, course: String, id: String): VoicePrefs {
        val next = load().with(character, course, id)
        save(next)
        write(next.toJson().toString())
        return next
    }

    fun clear() = write(null)

    companion object {
        const val KEY = "voicePrefs.v1"
    }
}
