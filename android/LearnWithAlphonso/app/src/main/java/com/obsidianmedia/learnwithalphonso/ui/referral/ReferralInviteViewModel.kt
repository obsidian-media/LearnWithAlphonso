package com.obsidianmedia.learnwithalphonso.ui.referral

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralClaimResult
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralCodeStore
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralCopy
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralLink
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralPending
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralSummary
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.claimReferral
import com.obsidianmedia.learnwithalphonso.core.net.fetchReferralRows
import com.obsidianmedia.learnwithalphonso.core.net.getMyFriendCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReferralInviteState(
    val isLoading: Boolean = true,
    /** The learner's referral link, or null when the code could not be read (the screen says so; never a made-up link). */
    val link: String? = null,
    /** The counts, or null when the read failed (no card; never a made-up zero). */
    val summary: ReferralSummary? = null,
    val copied: Boolean = false,
    val entry: String = "",
    val entryMessage: String? = null,
    val entryDone: Boolean = false,
    val isClaiming: Boolean = false,
) {
    /** What the native share sheet carries: the invitation line and the link; null until there is a link. */
    val shareText: String? get() = link?.let(ReferralLink::shareText)
    val canClaim: Boolean get() = !isClaiming && ReferralLink.codeFromEntry(entry) != null
}

/**
 * The Invite screen's state. It only DISPLAYS and CLAIMS: whether anything is granted is decided on the server after the
 * friend's first completed lesson. A new learner whose link did not open the app types or pastes the code ("Got an invite
 * code?"), the manual fallback for a link that did not open the app. Port of ReferralInviteView.swift.
 */
class ReferralInviteViewModel(
    private val client: ProgressSyncClient,
    private val store: ReferralCodeStore,
    private val userId: String?,
    private val apiBaseUrl: String,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(ReferralInviteState())
    val state: StateFlow<ReferralInviteState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            val code = runCatching { client.getMyFriendCode() }.getOrElse { if (it is CancellationException) throw it else null }
            val rows = userId?.let { id -> runCatching { client.fetchReferralRows(id) }.getOrElse { if (it is CancellationException) throw it else null } }
            _state.update {
                it.copy(
                    isLoading = false,
                    link = code?.let { c -> ReferralLink.link(apiBaseUrl, c) },
                    summary = rows?.let { r -> ReferralSummary.summarize(r, nowMillis()) },
                )
            }
        }
    }

    fun onEntryChange(text: String) = _state.update { it.copy(entry = text, entryMessage = null) }

    fun markCopied() = _state.update { it.copy(copied = true) }

    fun clearCopied() = _state.update { it.copy(copied = false) }

    /** Claims the typed or pasted code; the server decides (a new account only, once, never yourself). */
    fun claimEntry() {
        val s = _state.value
        if (!s.canClaim) return
        _state.update { it.copy(isClaiming = true, entryMessage = null) }
        viewModelScope.launch {
            val result = ReferralPending.claimManual(s.entry, store) { client.claimReferral(it) }
            _state.update {
                when (result) {
                    ReferralClaimResult.Claimed -> it.copy(isClaiming = false, entry = "", entryDone = true, entryMessage = ReferralCopy.ENTER_DONE)
                    is ReferralClaimResult.Refused -> it.copy(isClaiming = false, entryDone = false, entryMessage = ReferralCopy.refusal(result.reason))
                    ReferralClaimResult.Error -> it.copy(isClaiming = false, entryDone = false, entryMessage = ReferralCopy.CLAIM_ERROR)
                }
            }
        }
    }
}
