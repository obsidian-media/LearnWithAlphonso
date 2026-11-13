package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.AiErrorCopy
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.fetchHectorAllowanceUsedUp
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * BACKLOG 0.0-bq #5. The same cases as src/lib/hector-allowance.test.ts and HectorAllowanceTests.swift. The limit comes
 * from the server; nothing here pins a number the app holds.
 */
class HectorAllowanceTest {
    private val noon = Instant.parse("2026-11-12T12:00:00Z").toEpochMilli()
    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http) { noon }

    @Test
    fun `no row is not used up`() = assertFalse(HectorAllowance.isUsedUp(emptyList(), 150))

    @Test
    fun `one short of the limit still allows the turn`() = assertFalse(HectorAllowance.isUsedUp(listOf(149), 150))

    @Test
    fun `at and past the limit is used up whatever the server says`() {
        assertTrue(HectorAllowance.isUsedUp(listOf(150), 150))
        assertTrue(HectorAllowance.isUsedUp(listOf(153), 150))
        assertFalse(HectorAllowance.isUsedUp(listOf(150), 200))
        assertTrue(HectorAllowance.isUsedUp(listOf(40), 40))
    }

    @Test
    fun `with no limit from the server nothing is used up`() = assertFalse(HectorAllowance.isUsedUp(listOf(99_999), null))

    @Test
    fun `the limit is read from the app config answer only when it is a positive whole number`() {
        assertEquals(150, HectorAllowance.limit("""{"limits":{"hectorDaily":150}}"""))
        assertEquals(120, HectorAllowance.limit("""{"ios":{},"limits":{"hectorDaily":120}}"""))
        for (bad in listOf("{}", """{"limits":{}}""", """{"limits":{"hectorDaily":0}}""", """{"limits":{"hectorDaily":-3}}""", """{"limits":{"hectorDaily":1.5}}""", """{"limits":{"hectorDaily":"150"}}""", "nope")) {
            assertNull(HectorAllowance.limit(bad), bad)
        }
    }

    @Test
    fun `the day is the UTC date`() {
        assertEquals("2026-11-12", HectorAllowance.utcDay(Instant.parse("2026-11-12T23:59:59Z").toEpochMilli()))
        assertEquals("2026-11-13", HectorAllowance.utcDay(Instant.parse("2026-11-13T00:00:00Z").toEpochMilli()))
    }

    @Test
    fun `out for today is the servers quota copy`() = assertEquals(HectorAllowance.OUT_FOR_TODAY, AiErrorCopy.quotaExceededMessage(null))

    @Test
    fun `the client reads today's UTC row for kind hector`() = runTest {
        val fake = FakeSupabase { json("""[{"count":150}]""") }
        assertTrue(client(fake).fetchHectorAllowanceUsedUp(150))
        val req = fake.seen.single()
        assertEquals("/rest/v1/ai_usage", req.path)
        assertEquals("eq.2026-11-12", req.query["day"])
        assertEquals("eq.hector", req.query["kind"])
    }

    @Test
    fun `the client follows the servers limit not a constant`() = runTest {
        val fake = FakeSupabase { json("""[{"count":150}]""") }
        assertTrue(client(fake).fetchHectorAllowanceUsedUp(150))
        assertFalse(client(fake).fetchHectorAllowanceUsedUp(200))
    }

    @Test
    fun `the client is not used up one short or with no row`() = runTest {
        assertFalse(client(FakeSupabase { json("""[{"count":149}]""") }).fetchHectorAllowanceUsedUp(150))
        assertFalse(client(FakeSupabase { json("[]") }).fetchHectorAllowanceUsedUp(150))
    }

    @Test
    fun `with no limit the client does not even read`() = runTest {
        val fake = FakeSupabase { json("""[{"count":99999}]""") }
        assertFalse(client(fake).fetchHectorAllowanceUsedUp(null))
        assertTrue(fake.seen.isEmpty())
    }

    @Test
    fun `the client fails open when the read fails`() = runTest {
        assertFalse(client(FakeSupabase { json("""{"message":"boom"}""", HttpStatusCode.InternalServerError) }).fetchHectorAllowanceUsedUp(150))
    }
}
