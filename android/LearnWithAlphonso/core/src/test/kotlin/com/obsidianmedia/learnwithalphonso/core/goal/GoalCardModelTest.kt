package com.obsidianmedia.learnwithalphonso.core.goal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GoalCardModelTest {
    private class FakeApi : GoalApi {
        var fetchHandler: suspend (String) -> LearningGoalState = { throw IllegalStateException("fetch not stubbed") }
        var saveHandler: suspend (String, String, String) -> LearningGoalState = { _, _, _ -> throw IllegalStateException("save not stubbed") }
        var removeHandler: suspend (String) -> Unit = { throw IllegalStateException("remove not stubbed") }
        var previewHandler: suspend (String, String, String) -> GoalPlan = { _, _, _ -> throw IllegalStateException("preview not stubbed") }
        var calls = 0
        override suspend fun fetch(course: String): LearningGoalState { calls++; return fetchHandler(course) }
        override suspend fun preview(course: String, targetLevel: String, targetDate: String): GoalPlan { calls++; return previewHandler(course, targetLevel, targetDate) }
        override suspend fun save(course: String, targetLevel: String, targetDate: String): LearningGoalState { calls++; return saveHandler(course, targetLevel, targetDate) }
        override suspend fun remove(course: String) { calls++; removeHandler(course) }
    }

    private class MemoryStore : GoalCacheStore {
        val map = HashMap<String, String>()
        override fun get(key: String): String? = map[key]
        override fun put(key: String, value: String) { map[key] = value }
        override fun remove(key: String) { map.remove(key) }
    }

    private val fixtures: JsonObject = ContentJson.json
        .parseToJsonElement(javaClass.getResource("/learning-goal.fixtures.json")!!.readText()).jsonObject
    private val withGoal: LearningGoalState = LearningGoalDecoding.state(fixtures["envelopes"]!!.jsonObject["stored"].toString())
    private val otherGoal: LearningGoalState = withGoal.copy(
        goal = withGoal.goal!!.copy(course = "fr", targetLevel = "B2"),
        plan = withGoal.plan!!.copy(targetLevel = "B2", status = GoalStatus.AHEAD),
    )
    private val none = LearningGoalState(null, null)

    private val api = FakeApi()
    private val store = MemoryStore()
    private val cache = GoalCache(store)
    private var user: String? = "u1"
    private val model = GoalCardModel(api, cache) { user }

    @Test
    fun `a load shows the goal and caches it`() = runTest {
        api.fetchHandler = { withGoal }
        model.load("en")
        val s = model.state.value
        assertEquals(GoalPhase.GOAL, s.phase)
        assertEquals(withGoal.goal, s.goal)
        assertEquals(withGoal.plan, s.plan)
        assertNull(s.loadError)
        assertEquals(withGoal, cache.read("u1", "en"))
    }

    @Test
    fun `a load with no goal is empty and clears an old cached entry`() = runTest {
        cache.write(withGoal, "u1", "en")
        api.fetchHandler = { none }
        model.load("en")
        assertEquals(GoalPhase.EMPTY, model.state.value.phase)
        assertNull(cache.read("u1", "en"))
    }

    @Test
    fun `offline with a cached plan shows it, flagged offline`() = runTest {
        cache.write(withGoal, "u1", "en")
        api.fetchHandler = { throw LearningGoalError.Offline }
        model.load("en")
        val s = model.state.value
        assertEquals(GoalPhase.GOAL, s.phase)
        assertEquals(withGoal.plan, s.plan)
        assertEquals(LearningGoalError.Offline, s.loadError)
        assertTrue(s.offline)
    }

    @Test
    fun `offline with nothing cached is a failure`() = runTest {
        api.fetchHandler = { throw LearningGoalError.Offline }
        model.load("en")
        assertEquals(GoalPhase.FAILED, model.state.value.phase)
        assertEquals(LearningGoalError.Offline, model.state.value.loadError)
    }

    @Test
    fun `only being offline ever shows the cached plan, never a 401 or a server error`() = runTest {
        cache.write(withGoal, "u1", "en")
        for (failure in listOf(LearningGoalError.NotSignedIn, LearningGoalError.Unavailable, LearningGoalError.Invalid("x"))) {
            api.fetchHandler = { throw failure }
            model.load("en")
            assertEquals(GoalPhase.FAILED, model.state.value.phase, "$failure")
            assertNull(model.state.value.plan, "$failure")
        }
    }

    @Test
    fun `an unexpected exception is unavailable`() = runTest {
        api.fetchHandler = { throw IllegalStateException("boom") }
        model.load("en")
        assertEquals(LearningGoalError.Unavailable, model.state.value.loadError)
    }

    @Test
    fun `a signed-out user fails without calling the API`() = runTest {
        user = null
        model.load("en")
        assertEquals(GoalPhase.FAILED, model.state.value.phase)
        assertEquals(LearningGoalError.NotSignedIn, model.state.value.loadError)
        assertEquals(0, api.calls)
    }

    @Test
    fun `a slow load for the previous course never overwrites the new course`() = runTest {
        val slowEn = CompletableDeferred<LearningGoalState>()
        api.fetchHandler = { course -> if (course == "en") slowEn.await() else otherGoal }
        val first = launch { model.load("en") }
        runCurrent()
        model.load("fr")
        slowEn.complete(withGoal)
        first.join()
        assertEquals("fr", model.state.value.goal!!.course)
        assertEquals(GoalStatus.AHEAD, model.state.value.plan!!.status)
    }

    @Test
    fun `a slow failure for the previous course is dropped too`() = runTest {
        val slowEn = CompletableDeferred<LearningGoalState>()
        api.fetchHandler = { course -> if (course == "en") slowEn.await() else otherGoal }
        val first = launch { model.load("en") }
        runCurrent()
        model.load("fr")
        slowEn.completeExceptionally(LearningGoalError.Unavailable)
        first.join()
        assertEquals(GoalPhase.GOAL, model.state.value.phase)
        assertNull(model.state.value.loadError)
    }

    @Test
    fun `a save that finishes after a course switch is dropped but still cached for its own course`() = runTest {
        val slowSave = CompletableDeferred<LearningGoalState>()
        api.saveHandler = { _, _, _ -> slowSave.await() }
        api.fetchHandler = { otherGoal }
        var result: SaveResult? = null
        val job = launch { result = model.save("en", "B1", "2026-12-01") }
        runCurrent()
        model.load("fr")
        slowSave.complete(withGoal)
        job.join()
        assertEquals(SaveResult.Dropped, result)
        assertEquals("fr", model.state.value.goal!!.course)
        assertEquals(withGoal, cache.read("u1", "en"))
    }

    @Test
    fun `a remove that finishes after a course switch does not empty the new course but clears its own cache`() = runTest {
        cache.write(withGoal, "u1", "en")
        val slowRemove = CompletableDeferred<Unit>()
        api.removeHandler = { slowRemove.await() }
        api.fetchHandler = { otherGoal }
        val job = launch { model.remove("en") }
        runCurrent()
        model.load("fr")
        slowRemove.complete(Unit)
        job.join()
        assertEquals(GoalPhase.GOAL, model.state.value.phase)
        assertEquals("fr", model.state.value.goal!!.course)
        assertNull(cache.read("u1", "en"))
    }

    @Test
    fun `a successful remove empties the card and the cache`() = runTest {
        api.fetchHandler = { withGoal }
        model.load("en")
        api.removeHandler = { }
        model.remove("en")
        assertEquals(GoalPhase.EMPTY, model.state.value.phase)
        assertNull(model.state.value.goal)
        assertNull(cache.read("u1", "en"))
    }

    @Test
    fun `a failed remove is an inline error that leaves the goal editable and is not offline`() = runTest {
        api.fetchHandler = { withGoal }
        model.load("en")
        api.removeHandler = { throw LearningGoalError.Offline }
        model.remove("en")
        val s = model.state.value
        assertEquals(GoalPhase.GOAL, s.phase)
        assertEquals("You're offline. Try again when you're connected.", s.actionError)
        assertNull(s.loadError)
        assertFalse(s.offline)
        assertNotNull(s.goal)
    }

    @Test
    fun `a successful save moves to the goal and writes the cache`() = runTest {
        api.saveHandler = { _, _, _ -> withGoal }
        val result = model.save("en", "B1", "2026-12-01")
        assertEquals(SaveResult.Saved, result)
        assertEquals(GoalPhase.GOAL, model.state.value.phase)
        assertEquals(withGoal, cache.read("u1", "en"))
    }

    @Test
    fun `a failed save reports the message and leaves the state alone`() = runTest {
        api.fetchHandler = { none }
        model.load("en")
        api.saveHandler = { _, _, _ -> throw LearningGoalError.Invalid("That level is below yours") }
        val result = model.save("en", "A1", "2026-12-01")
        assertEquals(SaveResult.Failed("That level is below yours"), result)
        assertEquals(GoalPhase.EMPTY, model.state.value.phase)
    }

    @Test
    fun `preview returns the plan or a message and never touches the card`() = runTest {
        api.fetchHandler = { withGoal }
        model.load("en")
        val before = model.state.value
        api.previewHandler = { _, _, _ -> withGoal.plan!! }
        assertEquals(PreviewResult.Ok(withGoal.plan!!), model.preview("en", "B1", "2026-12-01"))
        api.previewHandler = { _, _, _ -> throw LearningGoalError.Offline }
        assertEquals(PreviewResult.Failed("You're offline. Try again when you're connected."), model.preview("en", "B1", "2026-12-01"))
        assertEquals(before, model.state.value)
    }

    @Test
    fun `a preview in flight does not invalidate a load in flight`() = runTest {
        val slowLoad = CompletableDeferred<LearningGoalState>()
        api.fetchHandler = { slowLoad.await() }
        api.previewHandler = { _, _, _ -> withGoal.plan!! }
        val job = launch { model.load("en") }
        runCurrent()
        model.preview("en", "B1", "2026-12-01")
        slowLoad.complete(withGoal)
        job.join()
        assertEquals(GoalPhase.GOAL, model.state.value.phase)
    }

    @Test
    fun `a quiet reload keeps the card on screen while it fetches and then replaces it`() = runTest {
        api.fetchHandler = { withGoal }
        model.load("en")
        val slow = CompletableDeferred<LearningGoalState>()
        api.fetchHandler = { slow.await() }
        val job = launch { model.load("en", quiet = true) }
        runCurrent()
        // The learner sees the previous plan, not a "Loading" flash, while the refresh is in flight.
        assertEquals(GoalPhase.GOAL, model.state.value.phase)
        assertEquals(withGoal.plan, model.state.value.plan)
        val updated = withGoal.copy(plan = withGoal.plan!!.copy(lessonsRemaining = 3))
        slow.complete(updated)
        job.join()
        assertEquals(3, model.state.value.plan!!.lessonsRemaining)
    }

    @Test
    fun `a quiet reload that fails is shown honestly, not hidden`() = runTest {
        api.fetchHandler = { withGoal }
        model.load("en")
        api.fetchHandler = { throw LearningGoalError.Unavailable }
        model.load("en", quiet = true)
        assertEquals(GoalPhase.FAILED, model.state.value.phase)
        assertEquals(LearningGoalError.Unavailable, model.state.value.loadError)
    }

    @Test
    fun `a quiet reload on a card that shows nothing yet behaves like a normal load`() = runTest {
        api.fetchHandler = { withGoal }
        model.load("en", quiet = true)
        assertEquals(GoalPhase.GOAL, model.state.value.phase)
    }

    @Test
    fun `save and remove for a signed-out user fail without calling the API`() = runTest {
        user = null
        assertEquals(SaveResult.Failed("Sign in again to use goals."), model.save("en", "B1", "2026-12-01"))
        model.remove("en")
        assertEquals("Sign in again to use goals.", model.state.value.actionError)
        assertEquals(0, api.calls)
    }

    @Test
    fun `a cancelled load propagates and does not become an error state`() = runTest {
        api.fetchHandler = { throw CancellationException("screen left") }
        var thrown: Throwable? = null
        try {
            model.load("en")
        } catch (e: CancellationException) {
            thrown = e
        }
        assertNotNull(thrown)
        assertEquals(GoalPhase.LOADING, model.state.value.phase)
        assertNull(model.state.value.loadError)
    }
}
