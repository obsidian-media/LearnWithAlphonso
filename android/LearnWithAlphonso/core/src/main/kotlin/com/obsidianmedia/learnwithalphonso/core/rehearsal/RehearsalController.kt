package com.obsidianmedia.learnwithalphonso.core.rehearsal

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** What the screens call: [com.obsidianmedia.learnwithalphonso.core.net.RehearsalClient] in the app, a fake in tests. */
interface RehearsalApi {
    suspend fun state(course: String): RehearsalResult<RehearsalState>
    suspend fun create(intake: RehearsalIntake): RehearsalResult<Rehearsal>
    suspend fun createFromPreset(course: String, presetId: String, eventDate: String?): RehearsalResult<Rehearsal>
    suspend fun presets(course: String): RehearsalResult<List<RehearsalPreset>>
    /** Adds (or clears, with null) the day of an existing rehearsal without touching its other answers. */
    suspend fun setDate(id: String, eventDate: String?): RehearsalResult<Rehearsal>
    suspend fun adjust(id: String, intake: RehearsalIntake): RehearsalResult<Rehearsal>
    suspend fun cancel(id: String): RehearsalResult<Rehearsal>
    suspend fun outcome(id: String, choice: OutcomeChoice, newDate: String?): RehearsalResult<Rehearsal>
    suspend fun delete(id: String): RehearsalResult<Unit>
}

/** The opening line of each stage, written by us (src/data/rehearsal-templates.ts REHEARSAL_OPENERS); never sent to the model. */
object RehearsalOpeners {
    fun opener(course: String, stage: Stage): String = when (course) {
        "fr" -> when (stage) {
            Stage.WARMUP -> "Échauffons-nous. Dis bonjour et explique-moi pour quoi tu te prépares."
            Stage.CONVERSATION -> "Commencez quand vous voulez. Saluez-moi comme vous le feriez le jour J."
            Stage.HARD_MOMENTS -> "Travaillons les moments délicats. Commencez par une salutation, je m'occupe du reste."
        }
        "es" -> when (stage) {
            Stage.WARMUP -> "Vamos a calentar. Saluda y cuéntame para qué te estás preparando."
            Stage.CONVERSATION -> "Empiece cuando quiera. Salúdeme como lo haría el día de la cita."
            Stage.HARD_MOMENTS -> "Practiquemos los momentos difíciles. Empiece con un saludo y yo sigo."
        }
        else -> when (stage) {
            Stage.WARMUP -> "Let's warm up. Say hello and tell me what you are getting ready for."
            Stage.CONVERSATION -> "Start whenever you are ready. Greet me the way you would on the day."
            Stage.HARD_MOMENTS -> "Let's practise the tricky moments. Start with a greeting and I will take it from there."
        }
    }
}

data class RehearsalUiState(
    val loading: Boolean = true,
    val state: RehearsalState? = null,
    /** The last refusal; the screen turns it into words. */
    val error: RehearsalError? = null,
    val busy: Boolean = false,
    /** The Pro sheet is open: the entry was tapped by a learner who may not rehearse, or the server said 402. */
    val paywall: Boolean = false,
    /** The quick-starts in the server's order; null until they load. */
    val presets: List<RehearsalPreset>? = null,
    val presetsLoading: Boolean = false,
    /** The list could not be had (offline, an error, or the feature off): the picker offers "Something else" and a retry. */
    val presetsFailed: Boolean = false,
)

/**
 * The state machine behind the Rehearsal screens: no Android, so it is tested directly. Every refusal ends as an
 * [error] (and a 402 as [RehearsalUiState.paywall]), never an exception.
 */
class RehearsalController(private val api: RehearsalApi, private val course: String) {
    private val _ui = MutableStateFlow(RehearsalUiState())
    val ui: StateFlow<RehearsalUiState> = _ui.asStateFlow()

    suspend fun load() {
        _ui.update { it.copy(loading = it.state == null, error = null) }
        when (val r = api.state(course)) {
            is RehearsalResult.Ok -> _ui.update { it.copy(loading = false, state = r.value, error = null) }
            is RehearsalResult.Failed -> _ui.update { it.copy(loading = false, error = r.error) }
        }
    }

    /** A tap on the Learn entry (or the Today row): what opens, and the Pro sheet when it is the paywall. */
    fun entryTapped(isPro: Boolean): RehearsalEntry {
        val state = _ui.value.state ?: return RehearsalEntry.INTAKE
        val entry = RehearsalEntry.decide(state, isPro)
        if (entry == RehearsalEntry.PAYWALL) _ui.update { it.copy(paywall = true) }
        return entry
    }

    private val baselines = HashMap<String, Int>()

    /**
     * How many runs of [stage] the rehearsal had when the call [callId] began. Recorded the first time it is asked (the call
     * screen asks as soon as the state is loaded) and kept for that call, so a rotation or a state reload after the run
     * cannot move it; a new call (a repeat) records its own.
     */
    fun runsBefore(callId: String, stage: Stage): Int =
        baselines.getOrPut(callId) { _ui.value.state?.runs?.count { it.stage == stage.wire } ?: 0 }

    /** Forgets the last refusal, so a stale one never shows under another preset or after going back. */
    fun clearError() = _ui.update { it.copy(error = null) }

    fun dismissPaywall() = _ui.update { it.copy(paywall = false) }

    /** Creates the rehearsal; true when it exists now. A 402 opens the Pro sheet. */
    suspend fun create(intake: RehearsalIntake): Boolean = mutate { api.create(intake) }

    /** Loads the quick-starts; a failure is [RehearsalUiState.presetsFailed], never an exception, and a list already loaded is kept. */
    suspend fun loadPresets() {
        _ui.update { it.copy(presetsLoading = true, presetsFailed = false) }
        when (val r = api.presets(course)) {
            is RehearsalResult.Ok -> _ui.update { it.copy(presetsLoading = false, presets = r.value, presetsFailed = false) }
            is RehearsalResult.Failed -> _ui.update { it.copy(presetsLoading = false, presetsFailed = it.presets == null) }
        }
    }

    /** Creates the rehearsal from a quick-start, with no intake; the refusals (a 402 opens the Pro sheet) are [create]'s. */
    suspend fun createFromPreset(presetId: String, eventDate: String?): Boolean = mutate { api.createFromPreset(course, presetId, eventDate) }

    /** Groundwork, no screen yet: adds (or clears) the day of an existing rehearsal. */
    suspend fun setDate(id: String, eventDate: String?): Boolean = mutate { api.setDate(id, eventDate) }

    suspend fun adjust(id: String, intake: RehearsalIntake): Boolean = mutate { api.adjust(id, intake) }

    /** "How did it go?": a tap. `moved` needs [newDate]. */
    suspend fun outcome(id: String, choice: OutcomeChoice, newDate: String? = null): Boolean = mutate { api.outcome(id, choice, newDate) }

    /** "It didn't happen, close the rehearsal". */
    suspend fun close(id: String): Boolean = mutate { api.cancel(id) }

    suspend fun delete(id: String): Boolean = mutate { api.delete(id) }

    private suspend fun <T> mutate(call: suspend () -> RehearsalResult<T>): Boolean {
        _ui.update { it.copy(busy = true, error = null) }
        return when (val r = call()) {
            is RehearsalResult.Ok -> {
                _ui.update { it.copy(busy = false) }
                load()
                _ui.value.error == null
            }
            is RehearsalResult.Failed -> {
                _ui.update { it.copy(busy = false, error = r.error, paywall = it.paywall || r.error == RehearsalError.PAYWALL) }
                false
            }
        }
    }
}
