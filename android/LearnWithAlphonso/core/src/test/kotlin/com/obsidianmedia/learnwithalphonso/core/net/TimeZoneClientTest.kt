package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class TimeZoneClientTest {
    private val now = 1_758_000_000_000L

    private class Memory {
        var stamp: String? = null
        val reporter = TimeZoneReporter({ stamp }, { stamp = it })
    }

    @Test
    fun `the request is the own set_my_time_zone rpc carrying the zone`() = runTest {
        val fake = FakeSupabase { json("\"Europe/Paris\"", HttpStatusCode.OK) }
        ProgressSyncClient(fake.http) { now }.setMyTimeZone("Europe/Paris")
        val req = fake.seen.single()
        assertEquals("POST", req.method)
        assertEquals("/rest/v1/rpc/set_my_time_zone", req.path)
        assertEquals("""{"_time_zone":"Europe/Paris"}""", req.body)
    }

    @Test
    fun `a server refusal surfaces`() = runTest {
        val failing = FakeSupabase { json("""{"message":"not a known time zone"}""", HttpStatusCode.BadRequest) }
        assertThrows<ProgressSyncError.Server> { ProgressSyncClient(failing.http) { now }.setMyTimeZone("Mars/Olympus") }
    }

    @Test
    fun `sends once, then only when the zone changes`() = runTest {
        val m = Memory()
        val sent = mutableListOf<String>()
        assertTrue(m.reporter.syncIfChanged("u1", "Europe/Paris") { sent += it })
        assertFalse(m.reporter.syncIfChanged("u1", "Europe/Paris") { sent += it })
        assertTrue(m.reporter.syncIfChanged("u1", "America/Toronto") { sent += it })
        assertEquals(listOf("Europe/Paris", "America/Toronto"), sent)
    }

    @Test
    fun `a different account on the same device sends`() = runTest {
        val m = Memory()
        val sent = mutableListOf<String>()
        m.reporter.syncIfChanged("u1", "Europe/Paris") { sent += it }
        m.reporter.syncIfChanged("u2", "Europe/Paris") { sent += it }
        assertEquals(2, sent.size)
    }

    @Test
    fun `a failed send is not remembered and sign-out forgets`() = runTest {
        val m = Memory()
        assertFalse(m.reporter.syncIfChanged("u1", "Asia/Tokyo") { throw ProgressSyncError.Server(500, "x") })
        assertEquals(null, m.stamp)
        assertTrue(m.reporter.syncIfChanged("u1", "Asia/Tokyo") { })
        m.reporter.forget()
        assertTrue(m.reporter.syncIfChanged("u1", "Asia/Tokyo") { })
    }
}
