package com.obsidianmedia.learnwithalphonso.core.sync

import com.obsidianmedia.learnwithalphonso.core.net.LessonAnswer
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionResult
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncError
import kotlinx.coroutines.CancellationException
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Why a lesson completion failed, decided once, so the player and the sync queue treat each cause by its real meaning
 * (LessonCompletionError.swift). Before this, every failure was "queue it and say offline", so a rejected payload sat
 * in the queue forever and a 4xx read as "you're offline".
 */
sealed class LessonCompletionError : Exception() {
    data object Offline : LessonCompletionError()
    data object Unauthorized : LessonCompletionError()

    /** Only built for 5xx and 429: transient server trouble. */
    data class Server(val status: Int) : LessonCompletionError()

    /** Every other 4xx. `code` is the server's stable `{error}` code, or null when it sent prose. */
    data class Rejected(val code: String?) : LessonCompletionError()
    data object Timeout : LessonCompletionError()

    /** A completion payload that fails the local trust-boundary check. */
    data object InvalidPayload : LessonCompletionError()

    /**
     * True for offline, server and timeout. Rejected payloads are never queued (no retry can fix them); unauthorized is
     * resolved by signing in again, not by waiting.
     */
    val shouldQueue: Boolean
        get() = when (this) {
            Offline, is Server, Timeout -> true
            Unauthorized, is Rejected, InvalidPayload -> false
        }

    enum class FinishDisposition {
        /** Keep the attempt in the offline queue and say it is saved. */
        QUEUE,

        /** The attempt can never be saved: say why. */
        SHOW_FAILURE,
    }

    /**
     * Everything waiting can fix is queued, and so is out-of-hearts: a finish with no held session token mints one
     * then, and at 0 hearts that is refused. The attempt is still good, and sync defers it until a refill.
     */
    val finishDisposition: FinishDisposition
        get() = if (shouldQueue || this == Rejected("out-of-hearts")) FinishDisposition.QUEUE else FinishDisposition.SHOW_FAILURE

    val userMessage: String
        get() = when (this) {
            Offline -> "Saved. It will sync when you're back online."
            Timeout -> "The server took too long to answer. Your lesson is saved and will sync automatically."
            is Server -> "Our server had a problem. Your lesson is saved and will sync automatically."
            Unauthorized -> "You've been signed out, so this lesson couldn't be saved. Sign in to keep learning."
            is Rejected -> when (code) {
                "lesson-version-mismatch" -> "This lesson changed since you started it, so this attempt can't be saved. Update the app, then try the lesson again."
                "out-of-hearts" -> "Saved. It will sync when your hearts refill."
                else -> "We couldn't save this lesson."
            }
            InvalidPayload -> "We couldn't save this lesson."
        }

    /** The support path for failures the learner cannot fix by waiting. */
    val supportLine: String?
        get() = when (this) {
            is Rejected, InvalidPayload -> "If this keeps happening, email $SUPPORT_ADDRESS."
            else -> null
        }

    /** Stable reason for dead-letter rows and logs. Never shown to the learner. */
    val reasonCode: String
        get() = when (this) {
            Offline -> "offline"
            Unauthorized -> "unauthorized"
            is Server -> "server-$status"
            is Rejected -> code ?: "rejected"
            Timeout -> "timeout"
            InvalidPayload -> "invalid-payload"
        }

    /**
     * A 401 that survives the HTTP seam's single refresh means either "signed out" or "the refresh could not reach the
     * server". Only the first is the learner's problem; while the session is still there the finish is queued like any
     * other connection trouble (LessonPlayerView's `.unreachable` versus `.signedOut`).
     */
    fun whileSession(stillSignedIn: Boolean): LessonCompletionError = if (this == Unauthorized && stillSignedIn) Offline else this

    companion object {
        const val SUPPORT_ADDRESS = "support@alphonsoecosystem.app"
        private val STABLE_CODE = Regex("^[a-z][a-z0-9-]*$")

        fun classify(error: Throwable): LessonCompletionError {
            if (error is LessonCompletionError) return error
            return when (error) {
                is ProgressSyncError.OutOfHearts -> Rejected("out-of-hearts")
                is ProgressSyncError.Server -> classify(error.status, error.serverMessage)
                // A 2xx we could not read: the server may have recorded it, and complete-lesson is replay-safe.
                is ProgressSyncError.InvalidPayload -> Server(502)
                is SocketTimeoutException -> Timeout
                is IOException -> if (error.javaClass.simpleName.contains("Timeout", ignoreCase = true)) Timeout else Offline
                // A name that cannot be resolved surfaces from the engine as this, not as an IOException.
                is java.nio.channels.UnresolvedAddressException -> Offline
                else -> Server(500)
            }
        }

        fun classify(status: Int, code: String?): LessonCompletionError = when (status) {
            401 -> Unauthorized
            408 -> Timeout
            429, in 500..599 -> Server(status)
            else -> Rejected(stableCode(code))
        }

        /** The edge functions' `{error: "<code>"}` codes are lowercase-hyphenated. A sentence is not a code and is never matched or shown as one. */
        fun stableCode(raw: String?): String? = raw?.takeIf { STABLE_CODE.matches(it) }
    }
}

/** The two calls a completion needs. ProgressSyncClient is the production implementation; tests script it. */
interface LessonCompletionApi {
    suspend fun startLessonSession(lessonId: String, course: String): String
    suspend fun completeLesson(lessonId: String, total: Int, answers: List<LessonAnswer>, course: String, sessionToken: String): LessonCompletionResult
}

data class LessonCompletionRequest(
    val lessonId: String,
    val total: Int,
    val answers: List<LessonAnswer>,
    val course: String,
    /** The token from start-lesson-session when the lesson OPENED. Null means "start one now". */
    val sessionToken: String?,
) {
    constructor(pending: PendingLessonCompletion) : this(pending.lessonId, pending.total, pending.answers, pending.course, pending.sessionToken)
}

/**
 * One completion attempt, shared by the live finish and the sync queue, so both handle failures identically
 * (LessonCompletionService.swift):
 * - a held session token is used as is (the lesson was gated when it opened, not at the finish line);
 * - a 403 from complete-lesson on a held token (older than its 3 h lifetime) mints one new token and retries once;
 * - everything else is classified by [LessonCompletionError].
 * The access token and its single refresh on a 401 live in the HTTP seam (SupabaseHttp), so a 401 that reaches here
 * already survived a refresh and means signed out.
 */
class LessonCompletionService(private val api: LessonCompletionApi) {
    suspend fun complete(request: LessonCompletionRequest): Result<LessonCompletionResult> {
        var sessionToken = request.sessionToken
        var reminted = false
        while (true) {
            try {
                val sessionForCall = sessionToken ?: api.startLessonSession(request.lessonId, request.course).also { sessionToken = it }
                return Result.success(api.completeLesson(request.lessonId, request.total, request.answers, request.course, sessionForCall))
            } catch (e: CancellationException) {
                throw e
            } catch (e: ProgressSyncError.Server) {
                if (e.status == 403 && !reminted && request.sessionToken != null) {
                    reminted = true
                    sessionToken = null
                } else {
                    return Result.failure(LessonCompletionError.classify(e))
                }
            } catch (e: Exception) {
                return Result.failure(LessonCompletionError.classify(e))
            }
        }
    }
}
