package com.obsidianmedia.learnwithalphonso.core.team

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The refresh logic behind the team mission card. Plain Kotlin so it is unit tested without Android.
 *
 * Two properties matter. A slow answer that arrives after a newer request has finished is dropped (the team screen
 * refreshes after an owner kicks someone, and an older in-flight answer must not bring the old mission back). And a
 * failed refresh shows nothing rather than a stale or invented mission, the same as the web card.
 */
class TeamMissionModel(private val fetch: suspend () -> TeamMission?) {
    private val _state = MutableStateFlow<TeamMission?>(null)
    val state: StateFlow<TeamMission?> = _state.asStateFlow()

    @Volatile private var generation = 0

    suspend fun refresh() {
        val mine = ++generation
        val result = try {
            fetch()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        if (mine != generation) return
        _state.value = result
    }
}
