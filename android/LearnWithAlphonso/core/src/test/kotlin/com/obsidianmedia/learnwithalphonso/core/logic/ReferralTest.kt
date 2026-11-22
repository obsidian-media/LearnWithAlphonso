package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

private class MemoryStore : ReferralCodeStore {
    var kept: ReferralCodeStore.Kept? = null
    override fun load() = kept
    override fun save(code: String, atMillis: Long) { kept = ReferralCodeStore.Kept(code, atMillis) }
    override fun clear() { kept = null }
}

class ReferralTest {
    private val base = "https://learn.alphonsoecosystem.app"
    private val now = 1_790_000_000_000L // 2026-09-21

    // ---- link ----

    @Test
    fun `the invite link is built from the learner's code`() {
        assertEquals("https://learn.alphonsoecosystem.app/?ref=29d081151d67", ReferralLink.link(base, "29d081151d67"))
    }

    @Test
    fun `the link trims trailing slashes and encodes base64 characters`() {
        assertEquals("https://learn.alphonsoecosystem.app/?ref=a%2Bb%2Fc%3D", ReferralLink.link("$base/", "a+b/c="))
    }

    @Test
    fun `a built link reads back to the same code`() {
        for (code in listOf("29d081151d67", "a+b/c=", "Zx9_ab-q")) {
            val link = ReferralLink.link(base, code)
            assertEquals(code, ReferralLink.codeFromUrl(link), code)
            assertEquals(code, ReferralLink.codeFromEntry(link), code)
        }
    }

    @Test
    fun `only our host's referral link yields a code`() {
        assertNull(ReferralLink.codeFromUrl("https://evil.example/?ref=29d081151d67"))
        assertNull(ReferralLink.codeFromUrl("http://learn.alphonsoecosystem.app/?ref=29d081151d67"))
        assertNull(ReferralLink.codeFromUrl("https://learn.alphonsoecosystem.app/"))
        assertNull(ReferralLink.codeFromUrl("https://learn.alphonsoecosystem.app/?ref=a"))
        assertNull(ReferralLink.codeFromUrl("https://learn.alphonsoecosystem.app/?ref=a%20b%3Cscript%3E"))
        assertNull(ReferralLink.codeFromUrl("not a url"))
    }

    @Test
    fun `a typed entry is a bare code or a link and nothing else`() {
        assertEquals("29d081151d67", ReferralLink.codeFromEntry("  29d081151d67 \n"))
        assertNull(ReferralLink.codeFromEntry(""))
        assertNull(ReferralLink.codeFromEntry("hi there"))
        assertNull(ReferralLink.codeFromEntry("https://evil.example/?ref=29d081151d67"))
    }

    @Test
    fun `the native share carries the invitation and the link`() {
        val link = ReferralLink.link(base, "29d081151d67")
        val text = ReferralLink.shareText(link)
        assertTrue(text.startsWith(ReferralCopy.SHARE_TEXT))
        assertTrue(text.endsWith(link))
    }

    // ---- summary ----

    private fun row(status: String, capped: Boolean = false, at: Long? = null) = ReferralRow(status, capped, at)

    @Test
    fun `the counts cover completed, pending and the month's rewards`() {
        val s = ReferralSummary.summarize(
            listOf(row("completed", at = now), row("completed", at = now - 3_600_000), row("completed", true, now), row("pending"), row("other")),
            now,
        )
        assertEquals(ReferralSummary(completed = 3, pending = 1, rewardedThisMonth = 2), s)
    }

    @Test
    fun `a reward from last month does not count toward this month's cap`() {
        val monthStart = 1_788_220_800_000L // 2026-09-01T00:00:00Z
        val s = ReferralSummary.summarize(
            listOf(row("completed", at = monthStart - 60_000), row("completed", at = monthStart)),
            monthStart + 20 * 86_400_000L,
        )
        assertEquals(2, s.completed)
        assertEquals(1, s.rewardedThisMonth)
    }

    @Test
    fun `the cap is reached at twenty rewarded and not before`() {
        val nineteen = ReferralSummary(19, 0, 19)
        val twenty = ReferralSummary(25, 0, 20)
        assertFalse(nineteen.capReached)
        assertEquals(1, nineteen.rewardsLeft)
        assertTrue(twenty.capReached)
        assertEquals(0, twenty.rewardsLeft)
        assertEquals(0, ReferralSummary(0, 0, 99).rewardsLeft)
        assertEquals(20, ReferralConstants.MONTHLY_CAP)
    }

    @Test
    fun `the count line matches the web`() {
        assertEquals("No friends have finished a first lesson yet.", ReferralSummary(0, 0, 0).countLine)
        assertEquals("1 friend joined and finished a first lesson.", ReferralSummary(1, 0, 1).countLine)
        assertEquals("2 friends joined and finished a first lesson. 3 still to start.", ReferralSummary(2, 3, 2).countLine)
        assertEquals("19 of 20 rewards left this month.", ReferralSummary(1, 0, 1).rewardsLeftLine)
    }

    // ---- capture + claim once ----

    @Test
    fun `the first captured code wins and is persisted`() {
        val store = MemoryStore()
        ReferralPending.capture("first1234", store, now)
        ReferralPending.capture("second99", store, now + 5)
        assertEquals("first1234", ReferralPending.read(store, now))
    }

    @Test
    fun `a bad code is never kept`() {
        val store = MemoryStore()
        ReferralPending.capture("x", store, now)
        ReferralPending.capture(null, store, now)
        ReferralPending.capture("a b<c>", store, now)
        assertNull(store.kept)
    }

    @Test
    fun `a code older than thirty days is forgotten, and so is one from a clock that went backwards`() {
        val store = MemoryStore()
        store.kept = ReferralCodeStore.Kept("abcd1234", now)
        assertEquals("abcd1234", ReferralPending.read(store, now + ReferralConstants.KEEP_MS - 1))
        assertNull(ReferralPending.read(store, now + ReferralConstants.KEEP_MS + 1))
        assertNull(store.kept)
        store.kept = ReferralCodeStore.Kept("abcd1234", now)
        assertNull(ReferralPending.read(store, now - 3_600_000))
    }

    @Test
    fun `the captured code is claimed once after signup and then gone`() = runTest {
        val store = MemoryStore()
        ReferralPending.capture("abcd1234", store, now)
        val calls = mutableListOf<String>()
        val first = ReferralPending.claimPending(store, now) { calls += it; ReferralClaimResult.Claimed }
        val second = ReferralPending.claimPending(store, now) { calls += it; ReferralClaimResult.Claimed }
        assertEquals(ReferralPending.Outcome.CLAIMED, first)
        assertEquals(ReferralPending.Outcome.NONE, second)
        assertEquals(listOf("abcd1234"), calls)
        assertNull(store.kept)
    }

    @Test
    fun `nothing is sent when no code was captured`() = runTest {
        val calls = mutableListOf<String>()
        val outcome = ReferralPending.claimPending(MemoryStore(), now) { calls += it; ReferralClaimResult.Claimed }
        assertEquals(ReferralPending.Outcome.NONE, outcome)
        assertTrue(calls.isEmpty())
    }

    @Test
    fun `every real refusal is final and clears the code so it is not retried`() = runTest {
        for (reason in ReferralClaimReason.entries) {
            val store = MemoryStore().apply { kept = ReferralCodeStore.Kept("abcd1234", now) }
            val calls = mutableListOf<String>()
            val outcome = ReferralPending.claimPending(store, now) { calls += it; ReferralClaimResult.Refused(reason) }
            assertEquals(ReferralPending.Outcome.REFUSED, outcome, reason.raw)
            assertNull(store.kept, reason.raw)
            val again = ReferralPending.claimPending(store, now) { calls += it; ReferralClaimResult.Claimed }
            assertEquals(ReferralPending.Outcome.NONE, again)
            assertEquals(1, calls.size, reason.raw)
        }
    }

    @Test
    fun `an unexplained error keeps the code for the next launch`() = runTest {
        val store = MemoryStore().apply { kept = ReferralCodeStore.Kept("abcd1234", now) }
        val outcome = ReferralPending.claimPending(store, now) { ReferralClaimResult.Error }
        assertEquals(ReferralPending.Outcome.RETRY_LATER, outcome)
        assertEquals("abcd1234", store.kept?.code)
    }

    // ---- manual fallback ----

    @Test
    fun `the manual field calls claim_referral with the typed code`() = runTest {
        val calls = mutableListOf<String>()
        val result = ReferralPending.claimManual(" abcd1234 ", MemoryStore()) { calls += it; ReferralClaimResult.Claimed }
        assertEquals(ReferralClaimResult.Claimed, result)
        assertEquals(listOf("abcd1234"), calls)
    }

    @Test
    fun `the manual field accepts a pasted referral link`() = runTest {
        val calls = mutableListOf<String>()
        ReferralPending.claimManual("https://learn.alphonsoecosystem.app/?ref=abcd1234", MemoryStore()) { calls += it; ReferralClaimResult.Claimed }
        assertEquals(listOf("abcd1234"), calls)
    }

    @Test
    fun `a malformed manual entry is refused without calling the server`() = runTest {
        val calls = mutableListOf<String>()
        val result = ReferralPending.claimManual("nope nope", MemoryStore()) { calls += it; ReferralClaimResult.Claimed }
        assertEquals(ReferralClaimResult.Refused(ReferralClaimReason.UNKNOWN_CODE), result)
        assertTrue(calls.isEmpty())
    }

    @Test
    fun `a final manual answer clears a captured code so it is never claimed twice`() = runTest {
        val store = MemoryStore().apply { kept = ReferralCodeStore.Kept("capture1234", now) }
        ReferralPending.claimManual("abcd1234", store) { ReferralClaimResult.Refused(ReferralClaimReason.ALREADY_REFERRED) }
        assertNull(store.kept)
        val calls = mutableListOf<String>()
        val outcome = ReferralPending.claimPending(store, now) { calls += it; ReferralClaimResult.Claimed }
        assertEquals(ReferralPending.Outcome.NONE, outcome)
        assertTrue(calls.isEmpty())
    }

    @Test
    fun `a manual error keeps a captured code`() = runTest {
        val store = MemoryStore().apply { kept = ReferralCodeStore.Kept("capture1234", now) }
        val result = ReferralPending.claimManual("abcd1234", store) { ReferralClaimResult.Error }
        assertEquals(ReferralClaimResult.Error, result)
        assertNotNull(store.kept)
    }

    @Test
    fun `reads a referral code from the new and the previous host only`() {
        assertEquals("29d081151d67", ReferralLink.codeFromUrl("https://learnwithalphonso.com/?ref=29d081151d67"))
        assertEquals("29d081151d67", ReferralLink.codeFromUrl("https://learn.alphonsoecosystem.app/?ref=29d081151d67"))
        assertNull(ReferralLink.codeFromUrl("https://evil.example/?ref=29d081151d67"))
    }
}
