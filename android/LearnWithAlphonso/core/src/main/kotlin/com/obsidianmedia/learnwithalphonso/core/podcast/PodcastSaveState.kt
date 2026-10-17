package com.obsidianmedia.learnwithalphonso.core.podcast

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Bookkeeping for resume-position saves (PodcastSaveGate.swift, kept out of the app so it can be tested).
 *
 * The client guards each write on the `updated_at` it last observed (optimistic concurrency, see
 * `PodcastClient.savePlaybackPosition`). This decides what that observation is and when saving is pointless:
 * - `lastSeenUpdatedAt == null` means "no row known": the client upserts.
 * - After a save, the observation is what the SERVER stored. It used to be the device clock, which never matched what
 *   the database kept, so every second save looked stale.
 * - A stale write means another device wrote since we read. Saving stops until the learner acts (play, resume), because
 *   that action is a fresh observation and may win.
 * - A 401 stops saving until the learner acts, by which time the session may have refreshed.
 * - An account change resets the gate and bumps [epoch]. Each save captures the epoch it started under and only reports
 *   back if the gate still [accepts] it, so a save chained from the previous account never touches the new account's gate.
 */
class PodcastSaveGate(lastSeenUpdatedAt: String? = null) {
    var lastSeenUpdatedAt: String? = lastSeenUpdatedAt
        private set
    var isStale = false
        private set
    var isUnauthorized = false
        private set

    /** Bumped by [resetForAccountChange]. A save captures it when it is queued. */
    var epoch = 0
        private set

    val canSave: Boolean get() = !isStale && !isUnauthorized

    fun accepts(savedUnder: Int): Boolean = savedUnder == epoch

    /** Sign-out or account deletion: forget the previous account entirely. */
    fun resetForAccountChange() {
        lastSeenUpdatedAt = null
        isStale = false
        isUnauthorized = false
        epoch += 1
    }

    fun beginEpisode(lastSeenUpdatedAt: String?) {
        this.lastSeenUpdatedAt = lastSeenUpdatedAt
        isStale = false
    }

    fun userStartedPlayback() {
        if (isStale) {
            isStale = false
            lastSeenUpdatedAt = null
        }
        isUnauthorized = false
    }

    fun recordSaved(updatedAt: String?) {
        lastSeenUpdatedAt = updatedAt
    }

    fun recordStale() {
        isStale = true
        lastSeenUpdatedAt = null
    }

    fun recordUnauthorized() {
        isUnauthorized = true
    }
}

/**
 * What this device last stored for each episode it has played in this launch (PodcastSavedPositions.swift).
 *
 * The episode list is a snapshot taken when a folder opens. Playing an episode, closing the player and tapping the same
 * row again used to start from that stale snapshot: the row said nothing about resuming, playback began from the old
 * position, and the next save guarded on an `updated_at` this device had already moved past. Applying the last stored
 * position (and its `updated_at`) to the episode before it plays fixes all three.
 *
 * `updated_at` is written by whichever device saved, so stamps are compared by identity, never by order. The stored
 * position replaces a snapshot only when the snapshot's stamp is one this device has seen or stored itself (it is the
 * stale copy of our own history). A stamp this device has never seen came from elsewhere, for example another device,
 * and that snapshot wins.
 */
class PodcastSavedPositions {
    private class Entry(val position: Int, val updatedAt: String, val known: Set<String>)

    private val _revision = MutableStateFlow(0)

    /** Changes whenever what this device remembers does, so a list showing resumed rows can refresh. */
    val revision: StateFlow<Int> = _revision.asStateFlow()

    private val entries = HashMap<String, Entry>()

    /** Snapshot stamps seen at play time, kept until a save creates the entry they belong to. */
    private val seenBeforeSave = HashMap<String, Set<String>>()

    /** A save completed: remember the position and the stamp the server stored. */
    fun record(episodeId: String, position: Int, updatedAt: String?) {
        if (updatedAt == null) return
        val known = (entries[episodeId]?.known ?: seenBeforeSave[episodeId] ?: emptySet()) + updatedAt
        entries[episodeId] = Entry(maxOf(0, position), updatedAt, known)
        seenBeforeSave.remove(episodeId)
        _revision.update { it + 1 }
    }

    /** Playback started from this snapshot, so its stamp is part of this device's own history. */
    fun noteSeen(episode: PodcastEpisode) {
        val stamp = episode.playbackUpdatedAt ?: return
        val entry = entries[episode.id]
        if (entry != null) {
            // A stamp this device does not already know superseded its history (another device wrote since): the stored
            // position is older than the snapshot, so forget it rather than let it win later.
            if (stamp !in entry.known) {
                entries.remove(episode.id)
                seenBeforeSave[episode.id] = setOf(stamp)
                _revision.update { it + 1 }
            }
        } else {
            seenBeforeSave[episode.id] = (seenBeforeSave[episode.id] ?: emptySet()) + stamp
        }
    }

    /** The `updated_at` this device last stored for the episode, to guard a save made after the player left it. */
    fun lastStoredStamp(episodeId: String): String? = entries[episodeId]?.updatedAt

    /** Sign-out or account deletion: another account must never inherit these positions. */
    fun reset() {
        entries.clear()
        seenBeforeSave.clear()
        _revision.update { it + 1 }
    }

    fun applying(episode: PodcastEpisode): PodcastEpisode {
        val entry = entries[episode.id] ?: return episode
        val snapshot = episode.playbackUpdatedAt
        if (snapshot != null && snapshot !in entry.known) return episode
        return episode.copy(positionSeconds = entry.position, playbackUpdatedAt = entry.updatedAt)
    }
}

/** The "AI-narrated" label, the same wording and rule as the web (`src/lib/podcast-label.ts`) and iOS. */
object PodcastLabel {
    const val AI_NARRATED = "AI-narrated"

    private const val SEPARATOR = " · "

    /** Episodes generated by text-to-speech are AI-narrated; uploaded recordings are not labelled. */
    fun isAiNarrated(source: String?): Boolean = source == "tts"

    /** A downloaded episode's row subtitle in the offline list. */
    fun downloadedSubtitle(aiNarrated: Boolean): String = (listOf("Downloaded") + if (aiNarrated) listOf(AI_NARRATED) else emptyList()).joinToString(SEPARATOR)

    /** An episode row's subtitle on the Listen screen: length, then "Resume" and "AI-narrated" when they apply. */
    fun rowSubtitle(durationSeconds: Int, resume: Boolean, aiNarrated: Boolean): String {
        val length = String.format(java.util.Locale.ROOT, "%d:%02d", durationSeconds / 60, durationSeconds % 60)
        return (listOf(length) + (if (resume) listOf("Resume") else emptyList()) + (if (aiNarrated) listOf(AI_NARRATED) else emptyList())).joinToString(SEPARATOR)
    }
}
