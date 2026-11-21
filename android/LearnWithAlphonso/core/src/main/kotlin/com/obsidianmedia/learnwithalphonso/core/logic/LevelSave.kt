package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/**
 * The Learn level picker's save (set_cefr_level). The stored level is what start-lesson-session opens lessons from
 * (src/lib/lesson-unlock.ts), so a lost save leaves the map offering lessons the server refuses. The save is retried,
 * and the caller learns whether it landed so it can put the picker back on the stored level (LevelSave.swift).
 */
object LevelSave {
    const val ATTEMPTS = 3
    const val FAILED_MESSAGE = "Couldn't save your level. Check your connection and try again."

    /** Runs [save] up to [attempts] times, calling [pause] with the try that failed (1-based) between them. */
    suspend fun run(
        attempts: Int = ATTEMPTS,
        pause: suspend (failedTry: Int) -> Unit = { delay(it * 1_000L) },
        save: suspend () -> Unit,
    ): Boolean {
        for (tryNumber in 1..attempts) {
            try {
                save()
                return true
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (tryNumber < attempts) pause(tryNumber)
            }
        }
        return false
    }
}
