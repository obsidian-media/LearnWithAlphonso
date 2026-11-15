package com.obsidianmedia.learnwithalphonso.ui.support

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.logic.SendLimit
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessage
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessageKind
import com.obsidianmedia.learnwithalphonso.core.logic.SupportStatus
import com.obsidianmedia.learnwithalphonso.core.logic.SupportView
import com.obsidianmedia.learnwithalphonso.core.net.SupportClient
import com.obsidianmedia.learnwithalphonso.core.net.SupportConversation
import com.obsidianmedia.learnwithalphonso.core.net.SupportErrorKind
import com.obsidianmedia.learnwithalphonso.core.net.SupportException
import com.obsidianmedia.learnwithalphonso.core.net.SupportUpdate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

/** The three calls, injectable so the chat can be seeded without a network (screenshots, tests). */
interface HelpChatClient {
    suspend fun fetchConversation(): SupportConversation
    suspend fun send(text: String, clientId: String): SupportUpdate
    suspend fun handoff(): SupportUpdate
}

class LiveHelpChatClient(private val client: SupportClient) : HelpChatClient {
    override suspend fun fetchConversation() = client.fetchConversation()
    override suspend fun send(text: String, clientId: String) = client.send(text, clientId)
    override suspend fun handoff() = client.handoff()
}

/** A message the learner has sent that the server has not confirmed. Its text is kept until a retry succeeds. */
data class PendingMessage(val clientId: String, val text: String, val baseId: Long, val at: String, val sending: Boolean, val failure: SupportErrorKind?)

enum class HelpLoad { LOADING, ERROR, READY }

data class HelpChatState(
    val load: HelpLoad = HelpLoad.LOADING,
    val status: SupportStatus? = null,
    val aiAvailable: Boolean = false,
    val messages: List<SupportMessage> = emptyList(),
    /** Where the "New reply" divider goes (a message id), or null. */
    val dividerId: Long? = null,
    val pending: PendingMessage? = null,
    val limit: SendLimit? = null,
    /** Ids of the learner messages sent in this visit (they read "Sent"). */
    val sentIds: Set<Long> = emptySet(),
    val handoffBusy: Boolean = false,
    val handoffFailed: Boolean = false,
    val draft: String = "",
)

/**
 * The Help chat's state machine, the twin of the web's `useHelpChat`. The server decides everything that matters (who
 * answers, the status, the limits); this holds what is on screen. It polls every 20 s while a person (not the AI) has the
 * conversation and the screen is open and online, and a failed poll changes nothing. It works with `support_ai` off:
 * the server then answers `aiAvailable: false` and a person replies.
 */
class HelpChatViewModel(private val client: HelpChatClient, private val newClientId: () -> String = { UUID.randomUUID().toString() }) : ViewModel() {
    private val _state = MutableStateFlow(HelpChatState())
    val state: StateFlow<HelpChatState> = _state.asStateFlow()
    private var cleared = false

    init {
        // A message whose send failed after the screen was left comes back as the draft, never lost.
        keptDraft?.let { kept -> keptDraft = null; _state.update { it.copy(draft = kept) } }
        reload()
    }

    override fun onCleared() { cleared = true }

    fun reload() {
        _state.update { it.copy(load = HelpLoad.LOADING) }
        viewModelScope.launch {
            try {
                val c = client.fetchConversation()
                _state.update { it.copy(load = HelpLoad.READY, status = c.status, aiAvailable = c.aiAvailable, messages = c.messages, dividerId = SupportView.unreadDividerId(c.messages, c.unread)) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(load = HelpLoad.ERROR) }
            }
        }
    }

    fun setDraft(text: String) { _state.update { it.copy(draft = text.take(SupportMaxLength)) } }

    /**
     * The poll, for the screen to run under `repeatOnLifecycle(STARTED)`: a refetch at once (coming back to the app reads
     * what arrived while it was away), then one every 20 s. It stops when the screen stops, so a backgrounded app never polls.
     */
    suspend fun pollWhileStarted() {
        poll()
        while (true) {
            delay(SupportView.POLL_INTERVAL_MS)
            poll()
        }
    }

    internal suspend fun poll() {
        val s = _state.value
        if (s.load != HelpLoad.READY || s.pending?.sending == true || !SupportView.shouldPoll(s.status)) return
        try {
            val c = client.fetchConversation()
            _state.update { cur ->
                val known = cur.messages.map { it.id }.toSet()
                val fresh = c.messages.firstOrNull { it.kind == SupportMessageKind.SUPPORT && it.id !in known }
                cur.copy(status = c.status, aiAvailable = c.aiAvailable, messages = SupportView.mergeMessages(cur.messages, c.messages), dividerId = cur.dividerId ?: fresh?.id)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Quiet: a failed poll changes nothing; the next tick tries again.
        }
    }

    /** Whether the Send button works now: text, ready, online, no limit, nothing in flight or waiting for a retry. */
    fun canSend(online: Boolean): Boolean {
        val s = _state.value
        return s.draft.isNotBlank() && s.load == HelpLoad.READY && online && s.limit == null && s.pending == null
    }

    fun send(online: Boolean) {
        val s = _state.value
        if (!canSend(online)) return
        val text = s.draft.trim()
        _state.update { it.copy(draft = "") }
        attempt(PendingMessage(newClientId(), text, s.messages.maxOfOrNull { it.id } ?: 0L, Instant.now().toString(), sending = true, failure = null))
    }

    /** Same text, same client id: the server returns the stored message instead of posting twice. */
    fun retry() {
        val p = _state.value.pending ?: return
        if (!p.sending) attempt(p)
    }

    private fun attempt(p: PendingMessage) {
        _state.update { it.copy(pending = p.copy(sending = true, failure = null), limit = null) }
        viewModelScope.launch {
            try {
                // Leaving the screen must not cancel a send the learner already made (the draft box was cleared): the
                // request runs to its end, and a failure after the screen is gone is kept as the next draft.
                val u = withContext(NonCancellable) { client.send(p.text, p.clientId) }
                _state.update { cur ->
                    cur.copy(
                        pending = null, status = u.status, messages = SupportView.mergeMessages(cur.messages, u.messages),
                        sentIds = cur.sentIds + u.messages.filter { it.kind == SupportMessageKind.YOU }.map { it.id },
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val kind = (e as? SupportException)?.kind ?: SupportErrorKind.FAILED
                if (cleared && kind != SupportErrorKind.DAILY_LIMIT && kind != SupportErrorKind.CONVERSATION_LIMIT) keptDraft = p.text
                if (kind == SupportErrorKind.DAILY_LIMIT || kind == SupportErrorKind.CONVERSATION_LIMIT) {
                    // Nothing was stored: the draft is not kept (the box is closed for today).
                    _state.update { it.copy(pending = null, limit = if (kind == SupportErrorKind.DAILY_LIMIT) SendLimit.DAILY else SendLimit.CONVERSATION) }
                } else {
                    _state.update { it.copy(pending = p.copy(sending = false, failure = kind)) }
                }
            }
        }
    }

    fun talkToPerson(online: Boolean) {
        val s = _state.value
        if (s.handoffBusy || !online) return
        _state.update { it.copy(handoffBusy = true, handoffFailed = false) }
        viewModelScope.launch {
            try {
                val u = client.handoff()
                _state.update { cur -> cur.copy(handoffBusy = false, status = u.status, messages = SupportView.mergeMessages(cur.messages, u.messages), load = HelpLoad.READY) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(handoffBusy = false, handoffFailed = true) }
            }
        }
    }

    companion object {
        const val SupportMaxLength = 2000

        /** The text of a send that failed after the chat was left; the next chat opens with it as the draft. */
        @Volatile internal var keptDraft: String? = null
    }
}

/** A failed message the server already holds (a poll found it) is not drawn a second time. */
internal fun isStored(p: PendingMessage, messages: List<SupportMessage>): Boolean =
    !p.sending && messages.any { it.kind == SupportMessageKind.YOU && it.id > p.baseId && it.body == p.text }
