package com.obsidianmedia.learnwithalphonso.ui.referral

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralCodeStore
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralCopy
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

private class MemoryStore : ReferralCodeStore {
    var kept: ReferralCodeStore.Kept? = null
    override fun load() = kept
    override fun save(code: String, atMillis: Long) { kept = ReferralCodeStore.Kept(code, atMillis) }
    override fun clear() { kept = null }
}

class ReferralInviteViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val now = 1_790_000_000_000L // 2026-09-21
    private val base = "https://learn.alphonsoecosystem.app/"

    /** `rows` is the referrals table as the learner (the referrer) sees it; `claim` is claim_referral's answer. */
    private fun server(rows: String = "[]", rowsStatus: HttpStatusCode = HttpStatusCode.OK, claim: String = """[{"ok":true,"reason":null}]""") = FakeServer { req ->
        when {
            req.path.endsWith("get_or_create_my_friend_code") -> json("""[{"code":"29d081151d67"}]""")
            req.path.endsWith("claim_referral") -> json(claim)
            req.path.endsWith("/referrals") -> json(rows, rowsStatus)
            else -> json("")
        }
    }

    private fun vm(s: FakeServer, store: ReferralCodeStore = MemoryStore()) =
        ReferralInviteViewModel(s.progressClient, store, "me", base) { now }

    @Test
    fun `the invite link is built from the learner's own code`() = runBlocking {
        val v = vm(server())
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertEquals("https://learn.alphonsoecosystem.app/r/29d081151d67", v.state.value.link)
    }

    @Test
    fun `the share carries the invitation and the link`() = runBlocking {
        val v = vm(server())
        awaitTrue("loaded") { !v.state.value.isLoading }
        val text = v.state.value.shareText!!
        assertTrue(text.startsWith(ReferralCopy.SHARE_TEXT))
        assertTrue(text.endsWith("https://learn.alphonsoecosystem.app/r/29d081151d67"))
    }

    @Test
    fun `the count renders and the cap is not reached below twenty rewarded`() = runBlocking {
        val rows = """[{"status":"completed","capped":false,"completed_at":"2026-09-20T10:00:00+00:00"},{"status":"pending","capped":false,"completed_at":null}]"""
        val s = server(rows)
        val v = vm(s)
        awaitTrue("loaded") { !v.state.value.isLoading }
        val summary = v.state.value.summary!!
        assertEquals(1, summary.completed)
        assertEquals(1, summary.pending)
        assertFalse(summary.capReached)
        assertEquals("eq.me", s.seen.first { it.path.endsWith("/referrals") }.query["referrer_id"])
    }

    @Test
    fun `the cap-reached state shows at twenty rewarded this month`() = runBlocking {
        val rows = (1..20).joinToString(",", "[", "]") { """{"status":"completed","capped":false,"completed_at":"2026-09-1${it % 10}T10:00:00+00:00"}""" }
        val v = vm(server(rows))
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertTrue(v.state.value.summary!!.capReached)
    }

    @Test
    fun `a failed read of the counts shows no card, never a made-up zero, and the link still works`() = runBlocking {
        val v = vm(server(rows = """{"message":"boom"}""", rowsStatus = HttpStatusCode.InternalServerError))
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertNull(v.state.value.summary)
        assertNotNull(v.state.value.link)
    }

    @Test
    fun `the manual code field calls claim_referral with the typed code and reports success`() = runBlocking {
        val s = server()
        val v = vm(s)
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.onEntryChange(" abcd1234 ")
        assertTrue(v.state.value.canClaim)
        v.claimEntry()
        awaitTrue("claimed") { v.state.value.entryDone }
        val call = s.seen.single { it.path.endsWith("claim_referral") }
        assertEquals("""{"_code":"abcd1234"}""", call.body)
        assertEquals(ReferralCopy.ENTER_DONE, v.state.value.entryMessage)
        assertEquals("", v.state.value.entry)
    }

    @Test
    fun `a refused code is explained and the field offers no second call for a malformed entry`() = runBlocking {
        val s = server(claim = """[{"ok":false,"reason":"too-late"}]""")
        val v = vm(s)
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.onEntryChange("abcd1234")
        v.claimEntry()
        awaitTrue("refused") { v.state.value.entryMessage != null }
        assertFalse(v.state.value.entryDone)
        assertTrue(v.state.value.entryMessage!!.contains("new accounts"))
        v.onEntryChange("nope nope")
        assertFalse(v.state.value.canClaim)
        v.claimEntry()
        assertEquals(1, s.seen.count { it.path.endsWith("claim_referral") })
    }

    @Test
    fun `a final manual answer clears a captured code so it is never claimed twice`() = runBlocking {
        val store = MemoryStore().apply { kept = ReferralCodeStore.Kept("capture1234", now) }
        val v = vm(server(claim = """[{"ok":false,"reason":"already-referred"}]"""), store)
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.onEntryChange("abcd1234")
        v.claimEntry()
        awaitTrue("answered") { v.state.value.entryMessage != null }
        assertNull(store.kept)
    }
}
