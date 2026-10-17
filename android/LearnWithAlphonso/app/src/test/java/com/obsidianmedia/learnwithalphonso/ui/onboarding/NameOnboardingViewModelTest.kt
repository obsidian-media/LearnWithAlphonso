package com.obsidianmedia.learnwithalphonso.ui.onboarding

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.core.logic.DisplayNameOnboarding
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class NameOnboardingViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private var finished = 0

    private fun vm(s: FakeServer, start: DisplayNameOnboarding = DisplayNameOnboarding.start("", "Learner-4F2A")) =
        NameOnboardingViewModel(s.progressClient, start, { finished++ }, debounceMillis = 0)

    private fun server(problem: String = "null", confirm: Pair<String, HttpStatusCode> = "\"Ana\"" to HttpStatusCode.OK, skip: Pair<String, HttpStatusCode> = "\"Learner-4F2A\"" to HttpStatusCode.OK) =
        FakeServer { req ->
            when {
                req.path.endsWith("display_name_problem") -> json(problem)
                req.path.endsWith("confirm_display_name") -> json(confirm.first, confirm.second)
                req.path.endsWith("skip_display_name_prompt") -> json(skip.first, skip.second)
                else -> json("[]")
            }
        }

    @Test
    fun `typing a name checks it with the server and then allows saving`() = runBlocking {
        val s = server()
        val v = vm(s)
        v.edit("  Ana   Lima ").join()
        assertEquals("""{"_name":"Ana Lima"}""", s.seen.single { it.path.endsWith("display_name_problem") }.body)
        assertTrue(v.state.value.canSave)
        assertEquals("Looks good.", v.state.value.message)
    }

    @Test
    fun `a prefilled name is checked on its own, before the learner types`() = runBlocking {
        val s = server(problem = "\"blocked-content\"")
        val v = vm(s, DisplayNameOnboarding.start("Ana", "Ana Lima"))
        v.currentCheck!!.join()
        assertEquals("That name isn't allowed. Try another.", v.state.value.message)
        assertFalse(v.state.value.canSave)
    }

    @Test
    fun `an answer for text the learner already changed is dropped`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        var calls = 0
        val s = FakeServer { req ->
            if (req.path.endsWith("display_name_problem")) {
                calls++
                if (calls == 1) { gate.await(); json("\"blocked-content\"") } else json("null")
            } else json("[]")
        }
        val v = vm(s)
        val firstEdit = async(start = CoroutineStart.UNDISPATCHED) { v.edit("Ana").join() }
        // The first check must really be in flight (its request sent and parked) before the learner types again:
        // otherwise the second edit cancels it before it ever asked, takes the first call's slot and waits on the gate forever.
        awaitTrue("the first check is in flight") { calls == 1 }
        // The learner types again, which cancels the first check and starts the second.
        v.edit("Anas").join()
        gate.complete(Unit)
        firstEdit.await()
        assertEquals("Anas", v.state.value.name)
        assertTrue("the stale blocked verdict must not stick", v.state.value.canSave)
    }

    @Test
    fun `an unreachable filter leaves saving allowed`() = runBlocking {
        val s = FakeServer { json("""{"message":"boom"}""", HttpStatusCode.InternalServerError) }
        val v = vm(s)
        v.edit("Ana").join()
        assertTrue(v.state.value.canSave)
        assertNull(v.state.value.message)
    }

    @Test
    fun `saving confirms the cleaned name and closes the prompt`() = runBlocking {
        val s = server()
        val v = vm(s)
        v.edit("Ana  Lima").join()
        v.save().join()
        assertEquals("""{"_name":"Ana Lima"}""", s.seen.single { it.path.endsWith("confirm_display_name") }.body)
        assertEquals(1, finished)
        assertFalse(v.state.value.isSubmitting)
    }

    @Test
    fun `a refused name stays on the prompt as the field's problem`() = runBlocking {
        val s = server(confirm = """{"code":"P0001","message":"blocked-content"}""" to HttpStatusCode.BadRequest)
        val v = vm(s)
        v.edit("Ana").join()
        v.save().join()
        assertEquals(0, finished)
        assertEquals("That name isn't allowed. Try another.", v.state.value.message)
        assertFalse(v.state.value.canSave)
    }

    @Test
    fun `a save that cannot reach the server says so and keeps the prompt`() = runBlocking {
        val s = server(confirm = """{"message":"boom"}""" to HttpStatusCode.InternalServerError)
        val v = vm(s)
        v.edit("Ana").join()
        v.save().join()
        assertEquals(0, finished)
        assertEquals("Couldn't save your name. Try again.", v.state.value.message)
    }

    @Test
    fun `save does nothing until the name is checked`() = runBlocking {
        val s = server()
        val v = vm(s)
        v.save().join()
        assertEquals(0, finished)
        assertTrue(s.seen.none { it.path.endsWith("confirm_display_name") })
    }

    @Test
    fun `skip closes the prompt even when the server cannot record it`() = runBlocking {
        val failing = server(skip = """{"message":"boom"}""" to HttpStatusCode.InternalServerError)
        val v = vm(failing)
        v.skip().join()
        assertEquals(1, finished)
        assertNotNull(failing.seen.singleOrNull { it.path.endsWith("skip_display_name_prompt") })
        assertFalse(v.state.value.isSubmitting)
    }

    @Test
    fun `skip after typing or a prefill sends nothing but the skip call`() = runBlocking {
        val typed = server()
        val v1 = vm(typed)
        v1.edit("Ana").join()
        v1.skip().join()
        val skip = typed.seen.single { it.path.endsWith("skip_display_name_prompt") }
        assertEquals("{}", skip.body)
        assertTrue("skipping never confirms what was typed", typed.seen.none { it.path.endsWith("confirm_display_name") })

        val prefilled = server()
        val v2 = vm(prefilled, DisplayNameOnboarding.start("Ana", "Ana Lima"))
        v2.currentCheck!!.join()
        v2.skip().join()
        assertEquals("{}", prefilled.seen.single { it.path.endsWith("skip_display_name_prompt") }.body)
        assertTrue(prefilled.seen.none { it.path.endsWith("confirm_display_name") })
    }

    @Test
    fun `a dropped connection while saving says the server could not be reached`() = runBlocking {
        val s = FakeServer { req ->
            if (req.path.endsWith("confirm_display_name")) throw java.io.IOException("offline")
            if (req.path.endsWith("display_name_problem")) json("null") else json("[]")
        }
        val v = vm(s)
        v.edit("Ana").join()
        v.save().join()
        assertEquals(0, finished)
        assertEquals("Couldn't reach the server. Check your connection and try again.", v.state.value.message)
        assertTrue("the learner can try again", v.state.value.canSave)
    }

    @Test
    fun `an unreadable answer while saving is the connection's problem too`() = runBlocking {
        val s = server(confirm = "42" to HttpStatusCode.OK)
        val v = vm(s)
        v.edit("Ana").join()
        v.save().join()
        assertEquals(0, finished)
        assertEquals("Couldn't reach the server. Check your connection and try again.", v.state.value.message)
    }

    @Test
    fun `save while the name is still being checked sends nothing`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val s = FakeServer { req ->
            when {
                req.path.endsWith("display_name_problem") -> { gate.await(); json("null") }
                req.path.endsWith("confirm_display_name") -> json("\"Ana\"")
                else -> json("[]")
            }
        }
        val v = vm(s)
        val checking = v.edit("Ana")
        assertEquals("Checking…", v.state.value.message)
        v.save().join()
        assertEquals(0, finished)
        assertTrue(s.seen.none { it.path.endsWith("confirm_display_name") })
        gate.complete(Unit)
        checking.join()
        assertTrue(v.state.value.canSave)
    }

    @Test
    fun `skip on a healthy server stamps it and closes`() = runBlocking {
        val s = server()
        vm(s).skip().join()
        assertEquals(1, finished)
        assertEquals(1, s.seen.count { it.path.endsWith("skip_display_name_prompt") })
    }
}
