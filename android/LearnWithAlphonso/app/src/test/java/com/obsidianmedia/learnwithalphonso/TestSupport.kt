package com.obsidianmedia.learnwithalphonso

import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import com.obsidianmedia.learnwithalphonso.core.net.TranslationGradingClient
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.client.request.HttpResponseData
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import java.io.File
import java.util.Collections

/**
 * Routes viewModelScope onto an unconfined dispatcher: launched work runs
 * inline until its first real suspension (a Ktor call on the mock engine's
 * thread) and resumes there, so tests wait on concrete conditions with
 * awaitTrue instead of virtual time.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule : TestWatcher() {
    override fun starting(description: Description) = Dispatchers.setMain(Dispatchers.Unconfined)
    override fun finished(description: Description) = Dispatchers.resetMain()
}

/** Polls a condition for up to `timeoutMs` of real time. */
fun awaitTrue(what: String = "condition", timeoutMs: Long = 5_000, predicate: () -> Boolean) {
    val end = System.currentTimeMillis() + timeoutMs
    while (!predicate()) {
        if (System.currentTimeMillis() > end) throw AssertionError("Timed out waiting for $what")
        Thread.sleep(5)
    }
}

/** The real bundled content, read straight from the assets folder. */
val testContent: ContentStore by lazy { ContentStore { name -> File("src/main/assets/$name").readText() } }

data class SeenRequest(val method: String, val path: String, val query: Map<String, String>, val body: String, val queryEntries: List<Pair<String, String>> = emptyList(), val headers: Map<String, String> = emptyMap()) {
    fun queryAll(key: String): List<String> = queryEntries.filter { it.first == key }.map { it.second }
}

/** A scripted Supabase and API server. */
class FakeServer(private val respond: suspend MockRequestHandleScope.(SeenRequest) -> HttpResponseData) {
    val seen: MutableList<SeenRequest> = Collections.synchronizedList(ArrayList())
    val engine = MockEngine { req ->
        val s = SeenRequest(
            req.method.value, req.url.encodedPath,
            req.url.parameters.entries().associate { (k, v) -> k to v.first() },
            req.body.toByteArray().decodeToString(),
            req.url.parameters.entries().flatMap { (k, vs) -> vs.map { k to it } },
            req.headers.entries().associate { (k, v) -> k to v.first() },
        )
        seen.add(s)
        respond(s)
    }
    val progressClient = ProgressSyncClient(SupabaseHttp("https://x.supabase.co", "pk", { "tok" }, engine))
    val translation = TranslationGradingClient(ApiHttp("https://api.example", { "tok" }, engine))

    fun paths(): List<String> = seen.map { it.path }

    companion object {
        fun MockRequestHandleScope.json(body: String, status: HttpStatusCode = HttpStatusCode.OK): HttpResponseData =
            respond(body, status, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
    }
}

/** In-memory SyncQueueStore for view-model tests. */
class MemorySyncStore : SyncQueueStore {
    val completions: MutableList<PendingLessonCompletion> = Collections.synchronizedList(ArrayList())
    val grades: MutableList<PendingReviewGrade> = Collections.synchronizedList(ArrayList())
    private val due = MutableStateFlow<List<ReviewItem>>(emptyList())
    private val progressFlow = MutableStateFlow<LessonCompletionProgress?>(null)
    var syncedAt: Long? = null

    override suspend fun pendingLessonCompletions() = completions.sortedBy { it.queuedAt }
    override suspend fun appendLessonCompletion(pending: PendingLessonCompletion) { completions.add(pending) }
    override suspend fun removeSyncedLessonCompletions(synced: List<PendingLessonCompletion>) { completions.removeAll(synced.toSet()) }
    override suspend fun pendingReviewGrades() = grades.sortedBy { it.queuedAt }
    override suspend fun appendReviewGrade(pending: PendingReviewGrade) { grades.add(pending) }
    override suspend fun removeSyncedReviewGrades(synced: List<PendingReviewGrade>) { grades.removeAll(synced.toSet()) }
    override suspend fun lastKnownDueReviews() = due.value
    override suspend fun replaceLastKnownDueReviews(items: List<ReviewItem>) { due.value = items }
    override suspend fun removeCachedDueReview(itemKey: String) { due.value = due.value.filterNot { it.itemKey == itemKey } }
    override val dueCount get() = due.map { it.size }
    override suspend fun lastKnownProgress() = progressFlow.value
    override val progress get() = progressFlow
    override suspend fun updateLastKnownProgress(progress: LessonCompletionProgress) { progressFlow.value = progress; syncedAt = 1L }
    override suspend fun lastSyncedAt() = syncedAt
    override suspend fun markSyncedNow() { syncedAt = 1L }
}

const val PROGRESS_JSON = """{"xp":100,"streak":1,"longestStreak":1,"lastActiveDate":"2026-09-18","hearts":4,"heartsRefillAt":null,"streakFreezes":0,"leagueTier":"bronze"}"""
