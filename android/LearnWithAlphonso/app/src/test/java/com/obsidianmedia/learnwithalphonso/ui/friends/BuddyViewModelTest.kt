package com.obsidianmedia.learnwithalphonso.ui.friends

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class BuddyViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val buddyRow =
        """{"pair_id":"p1","buddy_id":"u2","buddy_name":"Bo","buddy_avatar_seed":"cd","paired_at":"2026-10-01T00:00:00+00:00",
           "week_start":"2026-10-05","my_count":2,"buddy_count":3,"goal":3,"streak_weeks":4,"grace_available":true,"last_outcome":"hit"}"""
    private val outgoingToCy =
        """{"request_id":"r2","direction":"outgoing","other_id":"u3","other_name":"Cy","other_avatar_seed":"ef","requested_at":"2026-10-06T00:00:00+00:00"}"""

    private fun friend(id: String, name: String) = FriendProgress(userId = id, displayName = name, avatarSeed = "a", streak = 0, weekXp = 0)

    @Test
    fun `shows the buddy's week when paired`() = runBlocking {
        val s = FakeServer { req ->
            when {
                req.path.endsWith("get_my_buddy") -> json("[$buddyRow]")
                else -> json("[]")
            }
        }
        val v = BuddyViewModel(s.progressClient)
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertEquals("Bo", v.state.value.buddy!!.buddyName)
        assertFalse(v.state.value.loadFailed)
    }

    @Test
    fun `a failed lookup is a load failure, never the no-buddy state, and Try again recovers`() = runBlocking {
        var failing = true
        val s = FakeServer { req ->
            when {
                req.path.endsWith("get_my_buddy") ->
                    if (failing) json("[]", HttpStatusCode.InternalServerError) else json("[]")
                else -> json("[]")
            }
        }
        val v = BuddyViewModel(s.progressClient)
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertTrue("must not offer to ask a friend during an outage", v.state.value.loadFailed)

        failing = false
        v.load()
        awaitTrue("recovered") { !v.state.value.isLoading && !v.state.value.loadFailed }
        assertNull(v.state.value.buddy)
    }

    @Test
    fun `asking a friend posts the id, then shows the answer after the reload`() = runBlocking {
        var asked = false
        val s = FakeServer { req ->
            when {
                req.path.endsWith("request_buddy") -> { asked = true; json("""[{"status":"requested"}]""") }
                req.path.endsWith("get_buddy_requests") -> json(if (asked) "[${outgoingToCy.replace("u3", "u2")}]" else "[]")
                else -> json("[]")
            }
        }
        val v = BuddyViewModel(s.progressClient)
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.ask("u2")
        awaitTrue("answered") { v.state.value.message != null && !v.state.value.busy }
        assertEquals("Request sent. They'll see it on their Friends page.", v.state.value.message)
        assertEquals("""{"_friend":"u2"}""", s.seen.first { it.path.endsWith("request_buddy") }.body)
        assertEquals(1, v.state.value.requests.size)
    }

    @Test
    fun `a failed action says so instead of a server answer`() = runBlocking {
        val s = FakeServer { req ->
            when {
                req.path.endsWith("end_buddy") -> json("[]", HttpStatusCode.InternalServerError)
                req.path.endsWith("get_my_buddy") -> json("[$buddyRow]")
                else -> json("[]")
            }
        }
        val v = BuddyViewModel(s.progressClient)
        awaitTrue("loaded") { v.state.value.buddy != null }
        v.end()
        awaitTrue("answered") { v.state.value.message != null && !v.state.value.busy }
        assertEquals("Something went wrong. Try again.", v.state.value.message)
    }

    @Test
    fun `an answer never outlives the state it described, and the section stays up during a reload`() = runBlocking {
        val s = FakeServer { req ->
            when {
                req.path.endsWith("request_buddy") -> json("""[{"status":"requested"}]""")
                else -> json("[]")
            }
        }
        val v = BuddyViewModel(s.progressClient)
        awaitTrue("loaded") { v.state.value.hasLoaded }
        v.ask("u2")
        awaitTrue("answered") { v.state.value.message != null && !v.state.value.busy }
        assertTrue("first result kept the section on screen", v.state.value.hasLoaded)

        v.load()
        awaitTrue("reloaded") { s.seen.count { it.path.endsWith("get_my_buddy") } >= 3 && !v.state.value.isLoading }
        assertNull("a later reload clears the old answer", v.state.value.message)
    }

    @Test
    fun `only friends with no pending request either way can be asked`() = runBlocking {
        val s = FakeServer { req ->
            when {
                req.path.endsWith("get_buddy_requests") -> json("[$outgoingToCy]")
                else -> json("[]")
            }
        }
        val v = BuddyViewModel(s.progressClient)
        awaitTrue("loaded") { !v.state.value.isLoading }
        val askable = v.state.value.askable(listOf(friend("u2", "Bo"), friend("u3", "Cy")))
        assertEquals(listOf("u2"), askable.map { it.userId })
    }
}
