package com.obsidianmedia.learnwithalphonso.ui.practice

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The spoken scene openers already fetched this process (OpenerSpeechCache.swift on iOS). An opener is static text, so
 * reopening the call, restarting a scene or rotating replays the same bytes instead of asking /api/tts, and the voice
 * budget, again. Keyed by text, voice and course, so a voice changed in Settings fetches the new voice. A failure is
 * not cached. Concurrent requests for one line share one fetch (the lock is held across it; openers are short).
 */
class OpenerSpeechCache(private val capacity: Int = 12) {
    private val lock = Mutex()
    private val entries = object : LinkedHashMap<String, ByteArray>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>?) = size > capacity.coerceAtLeast(1)
    }

    val size: Int get() = entries.size

    suspend fun audio(text: String, voice: String?, course: String, synthesize: suspend () -> ByteArray): ByteArray {
        val key = listOf(course, voice.orEmpty(), text).joinToString("\u001F")
        return lock.withLock { entries[key] ?: synthesize().also { entries[key] = it } }
    }

    companion object {
        val shared = OpenerSpeechCache()
    }
}
