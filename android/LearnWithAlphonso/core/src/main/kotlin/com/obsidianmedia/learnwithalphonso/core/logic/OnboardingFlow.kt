package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What the signed-in app still has to ask a learner after a sign-in, held for the life of the process (not of one
 * composition), so a rotation neither re-runs the launch work nor loses the prompt, and a different account never
 * inherits the previous account's prompt or prefilled name (RootView.swift resets onboarding on an account change).
 * The order of the steps is [OnboardingSequence]; this holds the inputs and the steps already done. Main thread only.
 */
class OnboardingFlow {
    /** The public-name prompt on screen. [id] is unique per presentation, so a screen state keyed by it is never reused. */
    data class NamePresentation(val id: Int, val userId: String, val start: DisplayNameOnboarding)

    private var userId: String? = null
    private var launched = false
    private var nameConfirmed: Boolean? = null
    private var placementTaken: Boolean? = null
    private val done = mutableSetOf<OnboardingStep>()
    private var nextId = 0
    private val _name = MutableStateFlow<NamePresentation?>(null)
    val name: StateFlow<NamePresentation?> = _name.asStateFlow()

    /** True when this account's launch work should run now; false when it already ran (a rotation) or is running. */
    fun tryBegin(userId: String): Boolean {
        if (this.userId != userId) reset(userId)
        if (launched) return false
        launched = true
        return true
    }

    /** The launch work was cancelled before it finished (a rotation mid-way): let the next composition run it again. */
    fun abandon(userId: String) {
        if (this.userId == userId) launched = false
    }

    /** Signed out, or an account change: nothing of the previous account survives. */
    fun reset(newUserId: String? = null) {
        userId = newUserId
        launched = false
        nameConfirmed = null
        placementTaken = null
        done.clear()
        _name.value = null
    }

    /** What the checks found; a null input means that check failed this launch and its step is skipped. */
    fun record(userId: String, nameConfirmed: Boolean?, placementTaken: Boolean?) {
        if (this.userId != userId) return
        this.nameConfirmed = nameConfirmed
        this.placementTaken = placementTaken
    }

    /** The next step still to show for this account, or null. */
    fun next(userId: String): OnboardingStep? =
        if (this.userId != userId) null else OnboardingSequence.next(nameConfirmed, placementTaken, done)

    /** Puts the name prompt on screen for this account, or skips the step when it has no state to show. */
    fun presentName(userId: String, start: DisplayNameOnboarding?) {
        if (this.userId != userId) return
        if (start == null) { done.add(OnboardingStep.DISPLAY_NAME); return }
        _name.value = NamePresentation(nextId++, userId, start)
    }

    /** The prompt currently on screen for this account; one that belongs to another account is never returned. */
    fun nameFor(userId: String?): NamePresentation? = _name.value?.takeIf { it.userId == userId }

    fun finish(userId: String, step: OnboardingStep) {
        if (this.userId != userId) return
        done.add(step)
        if (step == OnboardingStep.DISPLAY_NAME) _name.value = null
    }
}
