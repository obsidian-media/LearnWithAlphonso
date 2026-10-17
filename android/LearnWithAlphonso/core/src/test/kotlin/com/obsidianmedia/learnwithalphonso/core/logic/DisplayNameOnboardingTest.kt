package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Reads the SAME fixture the web and iOS pin (core/src/test/resources/name-onboarding.fixtures.json is a byte-for-byte
 * copy, guarded by src/lib/name-onboarding-native-fixtures.test.ts).
 */
class DisplayNameOnboardingTest {
    private val root: JsonObject =
        Json.parseToJsonElement(javaClass.getResource("/name-onboarding.fixtures.json")!!.readText()).jsonObject

    private fun str(o: JsonObject, key: String): String? = o[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content

    @Test
    fun `copy is word for word the shared fixture`() {
        val c = root["copy"]!!.jsonObject
        assertEquals(str(c, "title"), NameOnboardingCopy.title)
        assertEquals(str(c, "publicNote"), NameOnboardingCopy.publicNote)
        assertEquals(str(c, "fieldLabel"), NameOnboardingCopy.fieldLabel)
        assertEquals(str(c, "save"), NameOnboardingCopy.save)
        assertEquals(str(c, "skip"), NameOnboardingCopy.skip)
        assertEquals(str(c, "checking"), NameOnboardingCopy.checking)
        assertEquals(str(c, "looksGood"), NameOnboardingCopy.looksGood)
        assertEquals(str(c, "skipNoteHandle")!!.replace("{name}", "Learner-4F2A"), NameOnboardingCopy.skipNote("Learner-4F2A"))
        assertEquals(str(c, "skipNoteGeneric"), NameOnboardingCopy.skipNote("Ana Lima"))
    }

    @Test
    fun `local length rule matches every fixture case`() {
        val cases = root["localProblem"]!!.jsonArray
        assertTrue(cases.size >= 9)
        for (case in cases.map { it.jsonObject }) {
            assertEquals(str(case, "expect"), DisplayNameOnboarding.localProblem(str(case, "input")!!), str(case, "id"))
        }
    }

    @Test
    fun `normalising matches every fixture case`() {
        for (case in root["normalized"]!!.jsonArray.map { it.jsonObject }) {
            assertEquals(str(case, "expect"), DisplayNameOnboarding.normalized(str(case, "input")!!), str(case, "id"))
        }
    }

    @Test
    fun `prefill matches every fixture case`() {
        val cases = root["prefill"]!!.jsonArray
        assertTrue(cases.size >= 9)
        for (case in cases.map { it.jsonObject }) {
            val names = AuthUserNames(str(case, "givenName"), str(case, "fullName"), str(case, "name"))
            assertEquals(str(case, "expect"), DisplayNameOnboarding.prefill(str(case, "appleGivenName"), names, str(case, "currentName")!!), str(case, "id"))
        }
    }

    @Test
    fun `a generated handle is a hint, never text, and nothing is saveable until the learner types`() {
        val s = DisplayNameOnboarding.start("Learner-4F2A", "Learner-4F2A")
        assertEquals("", s.name)
        assertEquals("Learner-4F2A", s.fieldPlaceholder)
        assertFalse(s.canSave)
        assertNull(s.message)
        assertEquals("Display name", DisplayNameOnboarding.start("", "Ana Lima").fieldPlaceholder)
    }

    @Test
    fun `a real prefill waits for its first server check`() {
        val s = DisplayNameOnboarding.start("Ana", "Ana Lima")
        assertEquals("Ana", s.name)
        assertEquals(1, s.pendingCheck)
        assertFalse(s.canSave)
        assertEquals("Checking…", s.message)
    }

    @Test
    fun `the length rule decides on its own, an empty field is not wrong`() {
        val base = DisplayNameOnboarding.start("", "Learner-4F2A")
        val tooShort = base.edit("A")
        assertNull(tooShort.pendingCheck)
        assertEquals(DisplayNameOnboarding.Check.Problem("invalid-name"), tooShort.check)
        assertEquals("That name is too short or too long.", tooShort.message)
        val cleared = tooShort.edit("   ")
        assertEquals(DisplayNameOnboarding.Check.Idle, cleared.check)
        assertNull(cleared.message)
    }

    @Test
    fun `a server verdict applies only to the text it was asked about`() {
        val first = DisplayNameOnboarding.start("", "Learner-4F2A").edit("Ana")
        val firstGen = first.pendingCheck!!
        val second = first.edit("Anast")
        // The answer for "Ana" arrives after the learner changed the text: dropped.
        val stale = second.applyCheck("blocked-content", firstGen)
        assertEquals(second.check, stale.check)
        val fresh = second.applyCheck(null, second.pendingCheck!!)
        assertEquals(DisplayNameOnboarding.Check.Ok, fresh.check)
        assertTrue(fresh.canSave)
        assertEquals("Looks good.", fresh.message)
    }

    @Test
    fun `a blocked verdict shows the not-allowed copy and cannot be saved`() {
        val s = DisplayNameOnboarding.start("", "x").edit("Bad Name").let { it.applyCheck("blocked-content", it.pendingCheck!!) }
        assertEquals("That name isn't allowed. Try another.", s.message)
        assertTrue(s.isProblem)
        assertFalse(s.canSave)
    }

    @Test
    fun `an unreachable filter still allows saving, the save checks again`() {
        val s = DisplayNameOnboarding.start("", "x").edit("Ana").let { it.checkFailed(it.pendingCheck!!) }
        assertEquals(DisplayNameOnboarding.Check.Unverified, s.check)
        assertTrue(s.canSave)
        assertNull(s.message)
    }

    @Test
    fun `submitting locks save and skip, a refused name becomes the field's problem, other failures a save error`() {
        val ready = DisplayNameOnboarding.start("", "x").edit("Ana").let { it.applyCheck(null, it.pendingCheck!!) }
        val submitting = ready.beginSubmit()!!
        assertNull(submitting.beginSubmit())
        assertFalse(submitting.canSave)
        assertFalse(submitting.canSkip)
        val refused = submitting.submitFailed("blocked-content", "unused")
        assertEquals(DisplayNameOnboarding.Check.Problem("blocked-content"), refused.check)
        assertFalse(refused.isSubmitting)
        val network = submitting.submitFailed(null, NameReasonCopy.connectionFailure)
        assertEquals(NameReasonCopy.connectionFailure, network.message)
        assertTrue(network.isProblem)
        // Editing clears a save error.
        assertNull(network.edit("Anas").submitError)
    }

    @Test
    fun `save failures are worded by cause`() {
        assertEquals(NameReasonCopy.connectionFailure, NameReasonCopy.nameSaveMessage(null, null, isConnectionFailure = true))
        assertEquals(NameReasonCopy.nameNotAllowed, NameReasonCopy.nameSaveMessage(400, "blocked-content", false))
        assertEquals("That name is too short or too long.", NameReasonCopy.nameSaveMessage(400, "invalid-name", false))
        assertEquals("That name is too short or too long.", NameReasonCopy.nameSaveMessage(400, "violates profiles_display_name_length_chk", false))
        assertEquals("Sign in again to continue.", NameReasonCopy.nameSaveMessage(401, "JWT expired", false))
        assertEquals(NameReasonCopy.nameSaveFailed, NameReasonCopy.nameSaveMessage(500, "boom", false))
    }

    @Test
    fun `the name step comes first, a failed check skips its step, and a done step is not shown twice`() {
        val none = emptySet<OnboardingStep>()
        assertEquals(OnboardingStep.DISPLAY_NAME, OnboardingSequence.next(nameConfirmed = false, placementTaken = false, done = none))
        assertEquals(OnboardingStep.PLACEMENT, OnboardingSequence.next(nameConfirmed = true, placementTaken = false, done = none))
        assertEquals(OnboardingStep.PLACEMENT, OnboardingSequence.next(nameConfirmed = false, placementTaken = false, done = setOf(OnboardingStep.DISPLAY_NAME)))
        assertNull(OnboardingSequence.next(nameConfirmed = null, placementTaken = null, done = none))
        assertNull(OnboardingSequence.next(nameConfirmed = true, placementTaken = true, done = none))
    }
}
