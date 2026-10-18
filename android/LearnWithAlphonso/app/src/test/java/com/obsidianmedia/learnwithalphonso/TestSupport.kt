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
import kotlinx.coroutines.yield
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

/**
 * In-memory SyncQueueStore for view-model tests. Its suspend functions yield first, like a database call: a caller that
 * has been cancelled finds out at the next one, which is what a real store does and what hid the self-cancelling wake-up.
 */
class MemorySyncStore : SyncQueueStore {
    val completions: MutableList<PendingLessonCompletion> = Collections.synchronizedList(ArrayList())
    val grades: MutableList<PendingReviewGrade> = Collections.synchronizedList(ArrayList())
    private val due = MutableStateFlow<List<ReviewItem>>(emptyList())
    private val progressFlow = MutableStateFlow<LessonCompletionProgress?>(null)
    var syncedAt: Long? = null

    /** Dead letters in the order they were written (oldest first). */
    class DeadRow(val kind: String, val identity: String, val reason: String, val ownerUserId: String?)
    val deadRows: MutableList<DeadRow> = Collections.synchronizedList(ArrayList())
    val deadLetterRows get() = deadRows.map { com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo(it.identity, it.reason) }

    var orphansResolved = false
    var clearedAll = 0
    private val counts = MutableStateFlow(0 to 0)
    private val deadFlow = MutableStateFlow(0)
    private fun publish() { counts.value = completions.size to grades.size }

    override suspend fun pendingLessonCompletions(): List<PendingLessonCompletion> { yield(); return completions.sortedBy { it.queuedAt } }
    override suspend fun appendLessonCompletion(pending: PendingLessonCompletion) { yield(); completions.add(pending); publish() }
    override suspend fun removeSyncedLessonCompletions(synced: List<PendingLessonCompletion>) { yield(); completions.removeAll(synced.toSet()); publish() }
    override suspend fun pendingReviewGrades(): List<PendingReviewGrade> { yield(); return grades.sortedBy { it.queuedAt } }
    override suspend fun appendReviewGrade(pending: PendingReviewGrade) { yield(); grades.add(pending); publish() }
    override suspend fun removeSyncedReviewGrades(synced: List<PendingReviewGrade>) { yield(); grades.removeAll(synced.toSet()); publish() }

    override suspend fun resolveOrphanedRows(restoredUserId: String?) {
        yield()
        if (!orphansResolved && restoredUserId != null) {
            synchronized(completions) { completions.replaceAll { if (it.ownerUserId == null) it.copy(ownerUserId = restoredUserId) else it } }
            synchronized(grades) { grades.replaceAll { if (it.ownerUserId == null) it.copy(ownerUserId = restoredUserId) else it } }
        } else {
            completions.removeAll { it.ownerUserId == null }
            grades.removeAll { it.ownerUserId == null }
        }
        orphansResolved = true
        publish()
    }

    val clearedAccounts = ArrayList<String>()

    override suspend fun clearAccount(userId: String) {
        yield()
        completions.removeAll { it.ownerUserId == userId || it.ownerUserId == null }
        grades.removeAll { it.ownerUserId == userId || it.ownerUserId == null }
        deadRows.removeAll { it.ownerUserId == userId || it.ownerUserId == null }
        due.value = emptyList(); progressFlow.value = null; syncedAt = null
        orphansResolved = true
        clearedAccounts.add(userId)
        publish(); deadFlow.value++
    }

    override suspend fun clearAll() {
        yield()
        completions.clear(); grades.clear(); deadRows.clear(); due.value = emptyList(); progressFlow.value = null; syncedAt = null
        orphansResolved = true
        clearedAll++
        publish(); deadFlow.value++
    }

    override suspend fun applySyncResult(result: com.obsidianmedia.learnwithalphonso.core.sync.SyncResult, nowMillis: Long) {
        yield()
        fun lesson(p: PendingLessonCompletion) = p.lessonId to p.queuedAt
        fun grade(p: PendingReviewGrade) = p.itemKey to p.queuedAt
        val gone = (result.syncedLessonCompletions + result.deadLetteredLessonCompletions.map { it.item } + result.droppedForeignLessonCompletions).map(::lesson).toSet()
        completions.removeAll { lesson(it) in gone }
        result.rescheduledLessonCompletions.forEach { r -> completions.replaceAll { if (lesson(it) == lesson(r)) r else it } }
        val goneGrades = (result.syncedReviewGrades + result.deadLetteredReviewGrades.map { it.item } + result.droppedForeignReviewGrades).map(::grade).toSet()
        grades.removeAll { grade(it) in goneGrades }
        result.rescheduledReviewGrades.forEach { r -> grades.replaceAll { if (grade(it) == grade(r)) r else it } }
        result.deadLetteredLessonCompletions.forEach { deadRows.add(DeadRow("lesson", it.item.queueIdentity, it.reason, it.item.ownerUserId)) }
        result.deadLetteredReviewGrades.forEach { deadRows.add(DeadRow("grade", it.item.queueIdentity, it.reason, it.item.ownerUserId)) }
        while (deadRows.size > 50) deadRows.removeAt(0)
        publish(); deadFlow.value++
    }

    override fun pendingLessonCount(userId: String?) =
        counts.map { userId?.let { u -> completions.count { c -> c.ownerUserId == null || c.ownerUserId == u } } ?: 0 }
    override fun pendingReviewGradeCount(userId: String?) =
        counts.map { userId?.let { u -> grades.count { g -> g.ownerUserId == null || g.ownerUserId == u } } ?: 0 }
    override val queueChanges get() = counts
    override fun lessonDeadLetters(userId: String?) = deadFlow.map {
        deadRows.filter { r -> r.kind == "lesson" && userId != null && r.ownerUserId == userId }.reversed()
            .map { r -> com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo(r.identity, r.reason) }
    }
    override suspend fun lastKnownDueReviews(): List<ReviewItem> { yield(); return due.value }
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
