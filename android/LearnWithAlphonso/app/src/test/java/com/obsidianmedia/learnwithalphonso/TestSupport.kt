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
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.setMain
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import java.io.File
import java.util.Collections
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.CoroutineContext

/**
 * Routes viewModelScope onto an unconfined dispatcher: launched work runs
 * inline until its first real suspension (a Ktor call on the mock engine's
 * thread) and resumes there, so tests wait on concrete conditions with
 * awaitTrue instead of virtual time.
 *
 * Main is installed ONCE for the whole JVM ([GatedMainDispatcher]) and the rule
 * only flips its open flag, so test boundaries never write TestMainDispatcher's
 * delegate (a late resume reading it during a write can throw "Dispatchers.Main
 * is used concurrently with setting it"). While a test runs the dispatcher is
 * open and behaves like Unconfined. When the test ends it closes: view-model
 * work still suspended on the mock engine that resumes afterwards is dropped
 * and counted, instead of crashing on an unset Main and failing whichever test
 * happens to be running. A late resume that lands after the NEXT test has
 * started is not dropped (the dispatcher is open again) and runs inline; that
 * only touches the previous test's own fakes. Dropped work is reported on
 * System.err with the name of the test that leaked it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule : TestWatcher() {
    public override fun starting(description: Description) {
        GatedMainDispatcher.install()
        GatedMainDispatcher.open = true
    }

    public override fun finished(description: Description) {
        GatedMainDispatcher.finishedTest = description.displayName
        GatedMainDispatcher.open = false
    }
}

/** The single Main for every view-model test. Open: like Unconfined. Closed: late dispatches are dropped and counted. */
@OptIn(ExperimentalCoroutinesApi::class)
object GatedMainDispatcher : CoroutineDispatcher() {
    @Volatile var open = false

    /** The test that closed the gate last, named in the warning for work it leaked. */
    @Volatile var finishedTest: String? = null
    private val dropped = AtomicInteger(0)
    val droppedCount: Int get() = dropped.get()

    private val installOnce: Unit by lazy { Dispatchers.setMain(this) }
    fun install() = installOnce

    override fun isDispatchNeeded(context: CoroutineContext): Boolean = !open

    override fun dispatch(context: CoroutineContext, block: Runnable) {
        if (open) {
            block.run()
        } else {
            dropped.incrementAndGet()
            System.err.println("Dropped a late Main dispatch: work still running when test '${finishedTest ?: "?"}' ended")
        }
    }
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
    /** Copy-on-write: tests iterate this while the mock engine appends from its own thread (a synchronized list still throws on iteration). */
    val seen: MutableList<SeenRequest> = java.util.concurrent.CopyOnWriteArrayList()
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
    override suspend fun appendLessonCompletion(pending: PendingLessonCompletion) { completions.add(pending); counts.value = completions.size to grades.size }
    override suspend fun removeSyncedLessonCompletions(synced: List<PendingLessonCompletion>) { completions.removeAll(synced.toSet()); counts.value = completions.size to grades.size }
    override suspend fun pendingReviewGrades() = grades.sortedBy { it.queuedAt }
    override suspend fun appendReviewGrade(pending: PendingReviewGrade) { grades.add(pending); counts.value = completions.size to grades.size }
    override suspend fun removeSyncedReviewGrades(synced: List<PendingReviewGrade>) { grades.removeAll(synced.toSet()); counts.value = completions.size to grades.size }
    val deadLetterRows: MutableList<com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo> = Collections.synchronizedList(ArrayList())
    override suspend fun adoptOrphanedRows(userId: String) {
        synchronized(completions) { completions.replaceAll { if (it.ownerUserId == null) it.copy(ownerUserId = userId) else it } }
        synchronized(grades) { grades.replaceAll { if (it.ownerUserId == null) it.copy(ownerUserId = userId) else it } }
    }
    override suspend fun applySyncResult(result: com.obsidianmedia.learnwithalphonso.core.sync.SyncResult, nowMillis: Long) {
        fun lesson(p: PendingLessonCompletion) = p.lessonId to p.queuedAt
        fun grade(p: PendingReviewGrade) = p.itemKey to p.queuedAt
        val gone = (result.syncedLessonCompletions + result.deadLetteredLessonCompletions.map { it.item } + result.droppedForeignLessonCompletions).map(::lesson).toSet()
        completions.removeAll { lesson(it) in gone }
        result.rescheduledLessonCompletions.forEach { r -> completions.replaceAll { if (lesson(it) == lesson(r)) r else it } }
        val goneGrades = (result.syncedReviewGrades + result.deadLetteredReviewGrades.map { it.item } + result.droppedForeignReviewGrades).map(::grade).toSet()
        grades.removeAll { grade(it) in goneGrades }
        result.rescheduledReviewGrades.forEach { r -> grades.replaceAll { if (grade(it) == grade(r)) r else it } }
        result.deadLetteredLessonCompletions.forEach { deadLetterRows.add(com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo(it.item.queueIdentity, it.reason)) }
        result.deadLetteredReviewGrades.forEach { deadLetterRows.add(com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo(it.item.queueIdentity, it.reason)) }
        counts.value = completions.size to grades.size
    }
    private val counts = MutableStateFlow(0 to 0)
    override val pendingLessonCount get() = counts.map { it.first }
    override val pendingReviewGradeCount get() = counts.map { it.second }
    override val deadLetters get() = MutableStateFlow(deadLetterRows.toList())
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
