package com.obsidianmedia.learnwithalphonso.ui.onboarding

import androidx.activity.compose.BackHandler
import androidx.annotation.VisibleForTesting
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.DisplayNameOnboarding
import com.obsidianmedia.learnwithalphonso.core.logic.NameOnboardingCopy
import com.obsidianmedia.learnwithalphonso.core.logic.OnboardingFlow
import com.obsidianmedia.learnwithalphonso.core.logic.NameReasonCopy
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncError
import com.obsidianmedia.learnwithalphonso.core.net.confirmDisplayName
import com.obsidianmedia.learnwithalphonso.core.net.displayNameProblem
import com.obsidianmedia.learnwithalphonso.core.net.skipDisplayNamePrompt
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException

/**
 * The one-time public-name prompt (NameOnboardingView.swift). Rules and copy are core's `DisplayNameOnboarding`
 * (shared with the web and iOS); this class only talks to the server. Skip can never trap the learner: a failure
 * still closes the prompt (Play and App Store review rules), and because nothing was stamped the prompt returns on
 * the next launch.
 */
class NameOnboardingViewModel(
    private val client: ProgressSyncClient,
    start: DisplayNameOnboarding,
    /** Replaced on every composition: after a rotation the callback must close the NEW composition's prompt. */
    var onFinish: () -> Unit,
    private val debounceMillis: Long = 400,
) : ViewModel() {
    private val _state = MutableStateFlow(start)
    val state: StateFlow<DisplayNameOnboarding> = _state.asStateFlow()
    private var checkJob: Job? = null

    /** The live check in flight (or the last one), so tests can join it instead of polling. */
    @VisibleForTesting
    val currentCheck: Job? get() = checkJob

    init {
        // A real prefill (a Google given name) arrives already waiting for its first server check.
        startCheckIfPending()
    }

    fun edit(text: String): Job {
        _state.update { if (text == it.name) it else it.edit(text) }
        return startCheckIfPending()
    }

    /** Live check, debounced; a newer edit cancels this job and a stale answer is dropped by generation. */
    private fun startCheckIfPending(): Job {
        checkJob?.cancel()
        val generation = _state.value.pendingCheck ?: return DONE.also { checkJob = null }
        val normalized = DisplayNameOnboarding.normalized(_state.value.name)
        return viewModelScope.launch {
            delay(debounceMillis)
            try {
                val problem = client.displayNameProblem(normalized)
                _state.update { it.applyCheck(problem, generation) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.checkFailed(generation) }
            }
        }.also { checkJob = it }
    }

    fun save(): Job {
        val begun = _state.value.takeIf { it.canSave }?.beginSubmit() ?: return DONE
        _state.value = begun
        return viewModelScope.launch {
            try {
                client.confirmDisplayName(DisplayNameOnboarding.normalized(begun.name))
                _state.update { it.submitSucceeded() }
                onFinish()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val server = e as? ProgressSyncError.Server
                // An unreadable answer is the connection's fault from the learner's side (iOS: badResponse).
                val connection = e is IOException || e is ProgressSyncError.InvalidPayload
                val message = NameReasonCopy.nameSaveMessage(server?.status, server?.serverMessage, isConnectionFailure = connection)
                _state.update { it.submitFailed(server?.serverMessage, message) }
            }
        }
    }

    /** Whether or not the server could record the skip, the prompt closes. */
    fun skip(): Job {
        val begun = _state.value.takeIf { it.canSkip }?.beginSubmit() ?: return DONE
        _state.value = begun
        checkJob?.cancel()
        return viewModelScope.launch {
            try {
                client.skipDisplayNamePrompt()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Nothing was stamped; the prompt returns next launch.
            }
            _state.update { it.submitSucceeded() }
            onFinish()
        }
    }

    private companion object {
        val DONE: Job = Job().also { it.complete() }
    }
}

@Composable
fun NameOnboardingScreen(container: AppContainer, presentation: OnboardingFlow.NamePresentation, onFinish: () -> Unit) {
    val palette = AlphonsoColor.palette
    // Keyed by the presentation, which belongs to one account: a view model from an earlier prompt (another account's
    // prefilled name) is never reused.
    val vm: NameOnboardingViewModel = viewModel(key = "name-onboarding-${presentation.id}") { NameOnboardingViewModel(container.progressClient, presentation.start, onFinish) }
    val state by vm.state.collectAsState()
    // The prompt cannot be backed out of: Skip is the way out and never traps the learner.
    BackHandler { }
    // The field is focused on arrival, so the keyboard is up and the learner can just type.
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    SideEffect { vm.onFinish = onFinish }

    Column(
        Modifier.fillMaxSize().background(palette.surface).imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(NameOnboardingCopy.title, style = MaterialTheme.typography.headlineMedium, color = palette.ink, modifier = Modifier.semantics { heading() })
        Text(NameOnboardingCopy.publicNote, style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
        // The generated handle is the placeholder, not text, so typing never appends to it.
        OutlinedTextField(
            value = state.name,
            onValueChange = { vm.edit(it) },
            label = { Text(NameOnboardingCopy.fieldLabel) },
            placeholder = { Text(state.fieldPlaceholder) },
            singleLine = true,
            isError = state.isProblem,
            enabled = !state.isSubmitting,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done, autoCorrectEnabled = false),
            keyboardActions = KeyboardActions(onDone = { vm.save() }),
            trailingIcon = if (state.name.isNotEmpty()) ({ TextButton(onClick = { vm.edit("") }) { Text("Clear", color = palette.inkSoft) } }) else null,
            modifier = Modifier.fillMaxWidth().focusRequester(focus),
        )
        state.message?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = if (state.isProblem) palette.destructive else palette.inkSoft)
        }
        AlphonsoPrimaryButton(NameOnboardingCopy.save, onClick = { vm.save() }, enabled = state.canSave, busy = state.isSubmitting)
        AlphonsoSecondaryButton(NameOnboardingCopy.skip, onClick = { vm.skip() }, enabled = state.canSkip)
        Text(NameOnboardingCopy.skipNote(state.currentName), style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
    }
}
