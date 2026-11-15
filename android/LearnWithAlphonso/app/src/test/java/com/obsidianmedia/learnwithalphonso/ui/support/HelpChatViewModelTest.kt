package com.obsidianmedia.learnwithalphonso.ui.support

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessage
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessageKind
import com.obsidianmedia.learnwithalphonso.core.logic.SupportStatus
import com.obsidianmedia.learnwithalphonso.core.net.SupportConversation
import com.obsidianmedia.learnwithalphonso.core.net.SupportErrorKind
import com.obsidianmedia.learnwithalphonso.core.net.SupportException
import com.obsidianmedia.learnwithalphonso.core.net.SupportUpdate
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class HelpChatViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @After fun clearKept() { HelpChatViewModel.keptDraft = null }

    private fun msg(id: Long, kind: SupportMessageKind, body: String) = SupportMessage(id, kind, body, "2026-11-14T09:41:00Z", null)

    /** A fake chat server: every send is recorded; [gate] holds a send open, [failWith] makes it fail. */
    private class FakeClient : HelpChatClient {
        val sends = ArrayList<Pair<String, String>>()
        @Volatile var failWith: SupportErrorKind? = null
        @Volatile var gate: CompletableDeferred<Unit>? = null
        @Volatile var finished = 0
        override suspend fun fetchConversation() = SupportConversation(SupportStatus.NONE, 0, emptyList(), false)
        override suspend fun send(text: String, clientId: String): SupportUpdate {
            sends.add(text to clientId)
            gate?.await()
            failWith?.let { throw SupportException(it) }
            finished++
            return SupportUpdate(SupportStatus.OPEN, listOf(SupportMessage(1, SupportMessageKind.YOU, text, "2026-11-14T09:41:00Z", null)))
        }
        override suspend fun handoff() = SupportUpdate(SupportStatus.NEW, emptyList())
    }

    private fun ready(client: FakeClient): HelpChatViewModel {
        val vm = HelpChatViewModel(client)
        awaitTrue("loaded") { vm.state.value.load == HelpLoad.READY }
        return vm
    }

    @Test
    fun `a retry sends the same text with the same client id, so the server can answer with the stored message`() = runBlocking {
        val client = FakeClient().apply { failWith = SupportErrorKind.UNREACHABLE }
        val vm = ready(client)
        vm.setDraft("my streak vanished")
        vm.send(online = true)
        awaitTrue("failed") { vm.state.value.pending?.sending == false }
        client.failWith = null
        vm.retry()
        awaitTrue("sent") { vm.state.value.pending == null }
        assertEquals(2, client.sends.size)
        assertEquals(client.sends[0], client.sends[1])
    }

    @Test
    fun `nothing is sent twice while a message is pending`() = runBlocking {
        val client = FakeClient().apply { gate = CompletableDeferred() }
        val vm = ready(client)
        vm.setDraft("first")
        vm.send(online = true)
        awaitTrue("in flight") { vm.state.value.pending?.sending == true }
        vm.setDraft("second")
        assertFalse(vm.canSend(online = true))
        vm.send(online = true)
        client.gate!!.complete(Unit)
        awaitTrue("done") { vm.state.value.pending == null }
        assertEquals(listOf("first"), client.sends.map { it.first })
    }

    @Test
    fun `a message is cut at 2000 characters and a blank draft cannot be sent`() = runBlocking {
        val vm = ready(FakeClient())
        vm.setDraft("x".repeat(3000))
        assertEquals(2000, vm.state.value.draft.length)
        vm.setDraft("   ")
        assertFalse(vm.canSend(online = true))
        assertFalse("offline cannot send", run { vm.setDraft("hi"); vm.canSend(online = false) })
    }

    @Test
    fun `a failed message the server already holds is not drawn twice`() {
        val pending = PendingMessage("c1", "hello", baseId = 4, at = "t", sending = false, failure = SupportErrorKind.UNREACHABLE)
        assertTrue(isStored(pending, listOf(msg(5, SupportMessageKind.YOU, "hello"))))
        assertFalse("an older message with the same words is not it", isStored(pending, listOf(msg(3, SupportMessageKind.YOU, "hello"))))
        assertFalse("a reply with the same words is not it", isStored(pending, listOf(msg(5, SupportMessageKind.SUPPORT, "hello"))))
        assertFalse("one still being sent is shown", isStored(pending.copy(sending = true), listOf(msg(5, SupportMessageKind.YOU, "hello"))))
    }

    private fun clearable(client: FakeClient): Pair<ViewModelStore, HelpChatViewModel> {
        val store = ViewModelStore()
        val factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T = HelpChatViewModel(client) as T
        }
        val vm = ViewModelProvider(store, factory)[HelpChatViewModel::class.java]
        return store to vm
    }

    @Test
    fun `leaving the screen does not cancel a send already made`() = runBlocking {
        val client = FakeClient().apply { gate = CompletableDeferred() }
        val (store, vm) = clearable(client)
        awaitTrue("loaded") { vm.state.value.load == HelpLoad.READY }
        vm.setDraft("please help")
        vm.send(online = true)
        awaitTrue("in flight") { client.sends.size == 1 }
        store.clear()
        client.gate!!.complete(Unit)
        awaitTrue("the request still ran to its end") { client.finished == 1 }
    }

    @Test
    fun `a send that fails after the screen was left comes back as the next draft`() = runBlocking {
        val client = FakeClient().apply { gate = CompletableDeferred(); failWith = SupportErrorKind.UNREACHABLE }
        val (store, vm) = clearable(client)
        awaitTrue("loaded") { vm.state.value.load == HelpLoad.READY }
        vm.setDraft("please help")
        vm.send(online = true)
        awaitTrue("in flight") { client.sends.size == 1 }
        store.clear()
        client.gate!!.complete(Unit)
        awaitTrue("kept") { HelpChatViewModel.keptDraft == "please help" }
        val next = HelpChatViewModel(FakeClient())
        assertEquals("please help", next.state.value.draft)
        assertNull("it comes back once", HelpChatViewModel.keptDraft)
    }

    @Test
    fun `a daily limit refusal after leaving is not kept as a draft, nothing was stored`() = runBlocking {
        val client = FakeClient().apply { gate = CompletableDeferred(); failWith = SupportErrorKind.DAILY_LIMIT }
        val (store, vm) = clearable(client)
        awaitTrue("loaded") { vm.state.value.load == HelpLoad.READY }
        vm.setDraft("please help")
        vm.send(online = true)
        awaitTrue("in flight") { client.sends.size == 1 }
        store.clear()
        client.gate!!.complete(Unit)
        Thread.sleep(300)
        assertNull(HelpChatViewModel.keptDraft)
    }
}
