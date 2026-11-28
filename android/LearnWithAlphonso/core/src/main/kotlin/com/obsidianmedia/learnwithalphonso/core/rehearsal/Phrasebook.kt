package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable

/** One phrase of the brief, in the course language, with its meaning line when the brief has one. */
@Serializable
data class PhraseEntry(val text: String, val meaning: String? = null)

/**
 * What the phrasebook keeps on the phone: the last loaded brief's phrases, so the page opens with no connection. Only text
 * (the brief's own phrases and their meaning lines), never the learner's words.
 */
@Serializable
data class PhrasebookSnapshot(val rehearsalId: String, val eventKind: String, val entries: List<PhraseEntry>) {
    val kind: EventKind get() = EventKind.fromWire(eventKind) ?: EventKind.OTHER
    fun encode(): String = ContentJson.json.encodeToString(serializer(), this)

    companion object {
        /** Anything that is not a snapshot, or one with no phrases, is null (a damaged or older file shows nothing). */
        fun decode(text: String?): PhrasebookSnapshot? =
            text?.let { runCatching { ContentJson.json.decodeFromString(serializer(), it) }.getOrNull() }?.takeIf { it.entries.isNotEmpty() }
    }
}

/** How a phrase was said: [SERVER] is the app's voice (/api/tts), [DEVICE] is the phone's own voice in the course language. */
enum class PhraseVoice { SERVER, DEVICE }

object Phrasebook {
    /**
     * "Your phrases for this event" opens once stage 1 (the warm-up) is done, and only while there are phrases to show.
     * The stage progress is the server's own field.
     */
    fun isOpen(state: RehearsalState): Boolean = state.active?.brief?.keyPhrases?.any { it.isNotBlank() } == true && state.isDone(Stage.WARMUP)

    /**
     * The brief's phrases, blanks dropped. Meanings are shown only when EVERY phrase has one at the SAME index of the brief's
     * meanings; a brief without meanings (a generated one), a shorter list, or any blank meaning gives none at all, so a
     * meaning never sits under the wrong phrase. Alignment is by position in the brief, so dropping a blank phrase never
     * shifts a later meaning onto a wrong one.
     */
    fun entries(brief: RehearsalBrief?): List<PhraseEntry> {
        if (brief == null) return emptyList()
        val kept = brief.keyPhrases.mapIndexedNotNull { i, raw -> raw.trim().takeIf { it.isNotEmpty() }?.let { i to it } }
        val meanings = brief.keyPhraseMeanings
        val aligned = meanings != null && meanings.size >= brief.keyPhrases.size && kept.all { (i, _) -> meanings[i].isNotBlank() }
        return kept.map { (i, text) -> PhraseEntry(text, if (aligned) meanings!![i].trim() else null) }
    }

    /** The snapshot to keep for a loaded state, or null when there is no active rehearsal, the warm-up is not done, or it has no phrases. */
    fun snapshot(state: RehearsalState): PhrasebookSnapshot? {
        if (!isOpen(state)) return null
        val r = state.active ?: return null
        val list = entries(r.brief)
        return if (list.isEmpty()) null else PhrasebookSnapshot(r.id, r.eventKind, list)
    }

    /**
     * Says a phrase: the server's voice first; when it cannot be fetched or played (offline, a failure, an empty answer),
     * the device voice. Returns which one spoke. A cancelled coroutine is never turned into a fallback.
     */
    suspend fun speak(
        fetch: suspend () -> ByteArray?,
        play: suspend (ByteArray) -> Boolean,
        device: () -> Unit,
    ): PhraseVoice {
        val audio = try { fetch() } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
        val played = if (audio == null || audio.isEmpty()) false else try { play(audio) } catch (e: CancellationException) { throw e } catch (e: Exception) { false }
        if (played) return PhraseVoice.SERVER
        device()
        return PhraseVoice.DEVICE
    }

    fun title(kind: EventKind): String = "Your phrases for this ${kind.short}"
    fun count(n: Int): String = "$n ${if (n == 1) "phrase" else "phrases"} for the day"
    const val HEAR_HINT = "Tap play to hear it."
    const val HEAR_ALPHONSO_HINT = "Tap play to hear Alphonso say it."

    /** The plan's row card subtitle: "8 phrases · tap to hear" (nothing about saying them until the spot-checks exist). */
    fun linkSubtitle(n: Int): String = "$n ${if (n == 1) "phrase" else "phrases"} · tap to hear"
    const val SAVED_NOTE = "Saved on this phone. With no connection, your phone’s own voice reads them."
    const val LINK_TITLE = "Your phrases"
    fun hearLabel(phrase: String): String = "Hear $phrase"
}
