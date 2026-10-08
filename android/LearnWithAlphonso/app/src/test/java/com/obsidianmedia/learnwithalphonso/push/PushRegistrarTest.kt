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
        PushRegistrar({ token }, { granted }, { signedIn }, { s.progressClient }, prefs, CoroutineScope(Dispatchers.Main))

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
}
