package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

class AppUpdateGateTest {
    private fun body(android: String) = """{"ios":{"minBuild":null,"storeUrl":null},"android":$android}"""

    @Test
    fun `only a known build below a set minimum needs an update`() {
        assertTrue(AppUpdateGate.needsUpdate(11, 12))
        assertFalse(AppUpdateGate.needsUpdate(12, 12))
        assertFalse(AppUpdateGate.needsUpdate(13, 12))
        assertFalse(AppUpdateGate.needsUpdate(11, null))
        assertFalse(AppUpdateGate.needsUpdate(null, 12))
    }

    @Test
    fun `off by default`() {
        assertNull(AppUpdateGate.requirement(body("""{"minBuild":null,"storeUrl":"https://play.example"}"""), 1))
    }

    @Test
    fun `a build below the minimum is sent to the store, and only an https link is kept`() {
        assertEquals(
            AppUpdateGate.Requirement("https://play.example/x"),
            AppUpdateGate.requirement(body("""{"minBuild":12,"storeUrl":"https://play.example/x"}"""), 11),
        )
        // No usable store link: no gate.
        assertNull(AppUpdateGate.requirement(body("""{"minBuild":12,"storeUrl":"javascript:alert(1)"}"""), 11))
        assertNull(AppUpdateGate.requirement(body("""{"minBuild":12,"storeUrl":null}"""), 11))
        // A minimum sent as a string is not a minimum.
        assertNull(AppUpdateGate.requirement(body("""{"minBuild":"12","storeUrl":"https://play.example/x"}"""), 11))
    }

    @Test
    fun `asks the app-config route and opens the app on any failure`() = runTest {
        var seen: String? = null
        val gated = MockEngine { req ->
            seen = req.url.toString()
            respond(body("""{"minBuild":12,"storeUrl":"https://play.example/x"}"""), HttpStatusCode.OK)
        }
        assertEquals(AppUpdateGate.Requirement("https://play.example/x"), AppUpdateGate.check("https://learn.example/", 11, gated))
        assertEquals("https://learn.example/api/app-config", seen)

        assertNull(AppUpdateGate.check("https://learn.example", 11, MockEngine { respond("oops", HttpStatusCode.InternalServerError) }))
        assertNull(AppUpdateGate.check("https://learn.example", 11, MockEngine { respond("<html>", HttpStatusCode.OK) }))
        assertNull(AppUpdateGate.check("https://learn.example", 11, MockEngine { throw IOException("offline") }))
        assertNull(AppUpdateGate.check("https://learn.example", null, gated))
    }
}
