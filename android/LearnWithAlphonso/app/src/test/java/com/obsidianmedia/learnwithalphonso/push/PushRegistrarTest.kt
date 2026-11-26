package com.obsidianmedia.learnwithalphonso.push

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.data.MemoryPrefs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

class PushRegistrarTest {
    @get:Rule val main = MainDispatcherRule()

    private fun registrar(s: FakeServer, prefs: MemoryPrefs, granted: Boolean, signedIn: Boolean, token: String? = "tok-1") =
        PushRegistrar({ token }, { granted }, { signedIn }, { s.progressClient }, prefs, CoroutineScope(Dispatchers.Main), onFailure)

    private val failures = mutableListOf<Pair<String, String>>()
    private val onFailure: (String, Throwable) -> Unit = { stage, e -> failures += stage to e::class.java.simpleName }

    private fun tokenRequests(s: FakeServer) =
        s.seen.filter { it.path.endsWith("device_tokens") || it.path.endsWith("claim_device_token") }

    @Test
    fun `uploads only with permission and a session, once per token, and deletes on sign out`() = runBlocking {
        val s = FakeServer { json("") }
        val prefs = MemoryPrefs()
        registrar(s, prefs, granted = false, signedIn = true).registerIfAuthorized()
        registrar(s, prefs, granted = true, signedIn = false).registerIfAuthorized()
        assertEquals(0, tokenRequests(s).size)

        val r = registrar(s, prefs, granted = true, signedIn = true)
        r.registerIfAuthorized()
        r.registerIfAuthorized()
        assertEquals(1, tokenRequests(s).size)
        assertEquals("POST", tokenRequests(s)[0].method)
        assertEquals("/rest/v1/rpc/claim_device_token", tokenRequests(s)[0].path)
        assertEquals(true, tokenRequests(s)[0].body.contains("\"_platform\":\"android\""))
        assertEquals("tok-1", prefs.getString(PushRegistrar.UPLOADED_KEY, null))

        r.onNewToken("tok-2")
        awaitTrue("rotated") { tokenRequests(s).size == 2 && prefs.getString(PushRegistrar.UPLOADED_KEY, null) == "tok-2" }

        r.onSignOut()
        awaitTrue("deleted") { tokenRequests(s).size == 3 }
        assertEquals("DELETE", tokenRequests(s)[2].method)
        assertEquals("eq.tok-2", tokenRequests(s)[2].query["token"])
        assertNull(prefs.getString(PushRegistrar.UPLOADED_KEY, null))

        // No Firebase in this build: a null token uploads nothing.
        registrar(s, MemoryPrefs(), granted = true, signedIn = true, token = null).registerIfAuthorized()
        assertEquals(3, tokenRequests(s).size)
    }

    @Test
    fun `a failed upload is reported with its stage and retried on the next launch, a failed token fetch too`() = runBlocking {
        val prefs = MemoryPrefs()
        val down = FakeServer { throw java.io.IOException("offline") }
        registrar(down, prefs, granted = true, signedIn = true).registerIfAuthorized()
        assertEquals(1, failures.size)
        assertEquals("upload", failures[0].first)
        assertNull("a failed upload must not be remembered as uploaded", prefs.getString(PushRegistrar.UPLOADED_KEY, null))

        // The next launch tries again, and a success reports nothing more.
        val up = FakeServer { json("") }
        registrar(up, prefs, granted = true, signedIn = true).registerIfAuthorized()
        assertEquals(1, failures.size)
        assertEquals("tok-1", prefs.getString(PushRegistrar.UPLOADED_KEY, null))

        val tokenFails = PushRegistrar({ error("no play services") }, { true }, { true }, { up.progressClient }, MemoryPrefs(), CoroutineScope(Dispatchers.Main), onFailure)
        tokenFails.registerIfAuthorized()
        assertEquals(listOf("upload", "token"), failures.map { it.first })
    }

    @Test
    fun `a build without Firebase and a reporter that throws are not failures`() = runBlocking {
        val s = FakeServer { json("") }
        registrar(s, MemoryPrefs(), granted = true, signedIn = true, token = null).registerIfAuthorized()
        assertEquals(0, failures.size)
        val boom = PushRegistrar({ "t" }, { true }, { true }, { FakeServer { throw java.io.IOException("x") }.progressClient }, MemoryPrefs(), CoroutineScope(Dispatchers.Main), onFailure = { _, _ -> error("reporter down") })
        boom.registerIfAuthorized() // must not throw
    }

    @Test
    fun `a failed upload is kept pending and retried a bounded number of times, then picked up on the next launch`() = runBlocking {
        val prefs = MemoryPrefs()
        var calls = 0
        val flaky = FakeServer { if (++calls <= 2) throw java.io.IOException("offline") else json("") }
        val waits = mutableListOf<Long>()
        val r = PushRegistrar({ "tok-1" }, { true }, { true }, { flaky.progressClient }, prefs, CoroutineScope(Dispatchers.Main), onFailure, listOf(10L, 20L, 30L), { waits += it })
        r.registerIfAuthorized()
        awaitTrue("registered after retries") { prefs.getString(PushRegistrar.UPLOADED_KEY, null) == "tok-1" }
        assertEquals(listOf(10L, 20L), waits)
        assertNull(prefs.getString(PushRegistrar.PENDING_KEY, null))
        assertEquals(2, failures.size)

        // Waits that all end in failure stop (bounded) and leave the token pending for the next launch.
        val dead = FakeServer { throw java.io.IOException("offline") }
        val prefs2 = MemoryPrefs()
        val r2 = PushRegistrar({ "tok-9" }, { true }, { true }, { dead.progressClient }, prefs2, CoroutineScope(Dispatchers.Main), onFailure, listOf(1L, 1L), { _ -> })
        r2.registerIfAuthorized()
        awaitTrue("pending") { prefs2.getString(PushRegistrar.PENDING_KEY, null) == "tok-9" && dead.seen.size >= 3 }
        assertNull(prefs2.getString(PushRegistrar.UPLOADED_KEY, null))
        // The log line carries a stage and class, never the token.
        assertEquals(true, failures.none { it.second.contains("tok-9") })
    }
}
