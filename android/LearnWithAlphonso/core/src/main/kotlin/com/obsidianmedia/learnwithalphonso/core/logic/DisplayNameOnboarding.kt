package com.obsidianmedia.learnwithalphonso.core.logic

/** Shared with the web prompt and the iOS Kit word for word (src/lib/name-onboarding.fixtures.json). */
object NameOnboardingCopy {
    const val title = "What should other learners call you?"
    const val publicNote = "This name is public. Other learners see it on leaderboards, teams and buddy cards. You can change it later in Settings."
    const val fieldLabel = "Display name"
    const val save = "Save name"
    const val skip = "Skip for now"
    const val checking = "Checking…"
    const val looksGood = "Looks good."

    fun skipNote(currentName: String): String =
        if (DisplayNameOnboarding.isLearnerHandle(currentName)) "If you skip, you'll appear as $currentName."
        else "If you skip, you'll appear as a learner name like Learner-4F2A."
}

/** Wording for the display-name reason codes (SocialReasonCopy.swift, src/lib/social-reason.fixtures.json). */
object NameReasonCopy {
    const val generic = "Something went wrong. Try again."
    const val nameSaveFailed = "Couldn't save your name. Try again."
    const val connectionFailure = "Couldn't reach the server. Check your connection and try again."
    const val nameNotAllowed = "That name isn't allowed. Try another."

    private val reasons = mapOf(
        "unauthenticated" to "Sign in again to continue.",
        "invalid-name" to "That name is too short or too long.",
        "blocked-content" to nameNotAllowed,
    )

    /** A code this build does not know is generic; null means the request itself failed. */
    fun message(code: String?): String = if (code == null) connectionFailure else reasons[code] ?: generic

    /** Copy for a failed display-name save: `confirm_display_name` raises the code as the message. */
    fun nameSaveMessage(status: Int?, serverMessage: String?, isConnectionFailure: Boolean): String {
        if (isConnectionFailure) return connectionFailure
        if (serverMessage == "blocked-content" || serverMessage == "invalid-name" || serverMessage == "unauthenticated") return message(serverMessage)
        if (serverMessage?.contains("profiles_display_name_length_chk") == true) return message("invalid-name")
        // An expired or missing session: retrying cannot help, signing in again can.
        if (status == 401) return message("unauthenticated")
        return nameSaveFailed
    }
}

/** Names from the auth record's user_metadata (Google: `given_name` may be absent, `full_name` and `name` are present). */
data class AuthUserNames(val givenName: String?, val fullName: String?, val name: String?)

/**
 * The one-time public-name prompt (port of DisplayNameOnboarding.swift). Pure state: the screen asks the server
 * through `display_name_problem` for live checks and `confirm_display_name` / `skip_display_name_prompt` to finish.
 * A generation number per edit discards answers for text the learner has already changed.
 */
data class DisplayNameOnboarding(
    val name: String,
    val currentName: String,
    val check: Check = Check.Idle,
    val isSubmitting: Boolean = false,
    val submitError: String? = null,
    private val generation: Int = 0,
) {
    sealed interface Check {
        data object Idle : Check
        data class Checking(val generation: Int) : Check
        data object Ok : Check
        data class Problem(val code: String) : Check

        /** The filter could not be reached. Saving is allowed: `confirm_display_name` checks again. */
        data object Unverified : Check
    }

    /** What the empty field shows: the generated handle the learner will get if they skip, else the field label. */
    val fieldPlaceholder: String get() = if (isLearnerHandle(currentName)) currentName else NameOnboardingCopy.fieldLabel

    /** The generation the screen should check against the server, or null when nothing is pending. */
    val pendingCheck: Int? get() = (check as? Check.Checking)?.generation

    /** Edits the text. A pending check is `pendingCheck` of the returned state; the length rule can decide on its own. */
    fun edit(text: String): DisplayNameOnboarding {
        val next = generation + 1
        val base = copy(name = text, submitError = null, generation = next)
        // An empty (or whitespace-only) field is untouched or cleared, not wrong: no message, nothing to save yet.
        if (normalized(text).isEmpty()) return base.copy(check = Check.Idle)
        localProblem(text)?.let { return base.copy(check = Check.Problem(it)) }
        return base.copy(check = Check.Checking(next))
    }

    fun applyCheck(problem: String?, generation: Int): DisplayNameOnboarding =
        if (generation != this.generation) this else copy(check = problem?.let { Check.Problem(it) } ?: Check.Ok)

    fun checkFailed(generation: Int): DisplayNameOnboarding =
        if (generation != this.generation) this else copy(check = Check.Unverified)

    val isProblem: Boolean get() = submitError != null || check is Check.Problem

    val message: String?
        get() = submitError ?: when (val c = check) {
            is Check.Problem -> NameReasonCopy.message(c.code)
            is Check.Checking -> NameOnboardingCopy.checking
            Check.Ok -> NameOnboardingCopy.looksGood
            Check.Idle, Check.Unverified -> null
        }

    val canSave: Boolean get() = !isSubmitting && (check == Check.Ok || check == Check.Unverified)

    val canSkip: Boolean get() = !isSubmitting

    fun beginSubmit(): DisplayNameOnboarding? = if (isSubmitting) null else copy(isSubmitting = true, submitError = null)

    /** A refused name (`blocked-content`, `invalid-name`) becomes the field's problem; anything else a save error. */
    fun submitFailed(refusedCode: String?, message: String): DisplayNameOnboarding =
        if (refusedCode == "blocked-content" || refusedCode == "invalid-name") copy(isSubmitting = false, check = Check.Problem(refusedCode))
        else copy(isSubmitting = false, submitError = message)

    fun submitSucceeded(): DisplayNameOnboarding = copy(isSubmitting = false)

    companion object {
        const val MIN_LENGTH = 2
        const val MAX_LENGTH = 40
        private val HANDLE = Regex("^Learner-[0-9A-F]{4}$")

        /** The generated handle is shown as a hint, never as text; nothing is checked or saveable until the learner types. */
        fun start(prefill: String, currentName: String): DisplayNameOnboarding {
            val empty = DisplayNameOnboarding(name = "", currentName = currentName)
            return if (isLearnerHandle(prefill)) empty else empty.edit(prefill)
        }

        fun needsPrompt(nameConfirmed: Boolean): Boolean = !nameConfirmed

        fun normalized(raw: String): String = raw.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")

        /** The server's length rule (2 to 40 after cleaning), counted in Unicode code points like Postgres char_length. */
        fun localProblem(raw: String): String? {
            val count = normalized(raw).let { it.codePointCount(0, it.length) }
            return if (count < MIN_LENGTH || count > MAX_LENGTH) "invalid-name" else null
        }

        fun isLearnerHandle(name: String): Boolean = HANDLE.matches(name)

        /** Google's given_name, else the first word of full_name or name, else the current stored name (a handle for new email users). */
        fun prefill(names: AuthUserNames?, currentName: String): String {
            val candidates = listOf(names?.givenName, firstWord(names?.fullName), firstWord(names?.name))
            for (candidate in candidates) {
                if (candidate == null) continue
                val clean = normalized(candidate)
                if (clean.isNotEmpty() && !clean.contains("@") && localProblem(clean) == null) return clean
            }
            return currentName
        }

        /** Prefill with an Apple given name first, as the shared fixture lists (Android has no Apple sign-in, so null). */
        fun prefill(first: String?, names: AuthUserNames?, currentName: String): String {
            first?.let { c ->
                val clean = normalized(c)
                if (clean.isNotEmpty() && !clean.contains("@") && localProblem(clean) == null) return clean
            }
            return prefill(names, currentName)
        }

        private fun firstWord(text: String?): String? = text?.let { normalized(it).split(" ").firstOrNull()?.takeIf { w -> w.isNotEmpty() } }
    }
}

enum class OnboardingStep { DISPLAY_NAME, PLACEMENT }

/**
 * What to show after a sign-in: the public-name prompt first, then English placement. A null input means that check
 * failed this launch; a failed check skips its step rather than blocking the app.
 */
object OnboardingSequence {
    fun next(nameConfirmed: Boolean?, placementTaken: Boolean?, done: Set<OnboardingStep>): OnboardingStep? {
        if (nameConfirmed == false && OnboardingStep.DISPLAY_NAME !in done) return OnboardingStep.DISPLAY_NAME
        if (placementTaken == false && OnboardingStep.PLACEMENT !in done) return OnboardingStep.PLACEMENT
        return null
    }
}
