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
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/** BACKLOG 0.0-bq #5. The same cases as src/lib/hector-allowance.test.ts and HectorAllowanceTests.swift. */
class HectorAllowanceTest {
    private val noon = Instant.parse("2026-11-12T12:00:00Z").toEpochMilli()
    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http) { noon }

    @Test
    fun `no row is not used up`() = assertFalse(HectorAllowance.isUsedUp(emptyList()))

    @Test
    fun `one short of the limit still allows the turn`() = assertFalse(HectorAllowance.isUsedUp(listOf(HectorAllowance.DAILY_LIMIT - 1)))

    @Test
    fun `at and past the limit is used up`() {
        assertTrue(HectorAllowance.isUsedUp(listOf(HectorAllowance.DAILY_LIMIT)))
        assertTrue(HectorAllowance.isUsedUp(listOf(HectorAllowance.DAILY_LIMIT + 3)))
    }

    @Test
    fun `the limit matches the database`() = assertEquals(150, HectorAllowance.DAILY_LIMIT)

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
        assertTrue(client(fake).fetchHectorAllowanceUsedUp())
        val req = fake.seen.single()
        assertEquals("/rest/v1/ai_usage", req.path)
        assertEquals("eq.2026-11-12", req.query["day"])
        assertEquals("eq.hector", req.query["kind"])
    }

    @Test
    fun `the client is not used up one short or with no row`() = runTest {
        assertFalse(client(FakeSupabase { json("""[{"count":149}]""") }).fetchHectorAllowanceUsedUp())
        assertFalse(client(FakeSupabase { json("[]") }).fetchHectorAllowanceUsedUp())
    }

    @Test
    fun `the client fails open when the read fails`() = runTest {
        assertFalse(client(FakeSupabase { json("""{"message":"boom"}""", HttpStatusCode.InternalServerError) }).fetchHectorAllowanceUsedUp())
    }
}
