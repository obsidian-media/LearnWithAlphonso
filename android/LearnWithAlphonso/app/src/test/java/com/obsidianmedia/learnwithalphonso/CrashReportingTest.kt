package com.obsidianmedia.learnwithalphonso

import io.sentry.Breadcrumb
import io.sentry.Hint
import io.sentry.SentryEvent
import io.sentry.android.core.SentryAndroidOptions
import io.sentry.protocol.App
import io.sentry.protocol.Device
import io.sentry.protocol.Message
import io.sentry.protocol.SentryException
import io.sentry.protocol.User
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pins the crash-reporting privacy promises (play/data-safety.md, the privacy policy). */
class CrashReportingTest {
    private val jwt =
        "eyJhbGciOiJIUzI1NiIsImtpZCI6Ik5wcWFkUT09IiwidHlwIjoiSldUIn0." +
            "eyJpc3MiOiJodHRwczovL3FoY2pwYnhmY2x0amJpdWtueXQuc3VwYWJhc2UuY28vYXV0aC92MSIsInN1YiI6IjFiNGMyZTc0LTlkNmEtNGM5Ni1hMGU1LTc3ZTgxNmE2ZTRmMiIsImVtYWlsIjoibGVhcm5lckBleGFtcGxlLmNvbSJ9." +
            "kP3x8Zr1mQv0_c5B2sXlT9uYhNfWd7aEoJ4iRqGtVbA"
    private val email = "maria.gonzalez+lwa@gmail.com"

    private fun configured() = SentryAndroidOptions().also { CrashReporting.configure(it) }

    @Test
    fun `uses the public Android project DSN`() {
        assertEquals(
            "https://b6dd7da7987cc485a8f020a4a80ae6f5@o4511662373273600.ingest.us.sentry.io/4512372763328512",
            configured().dsn,
        )
    }

    @Test
    fun `sends no PII, screenshots, view hierarchy, replay, tracing or sessions`() {
        val options = configured()
        assertFalse(options.isSendDefaultPii)
        assertFalse(options.isAttachScreenshot)
        assertFalse(options.isAttachViewHierarchy)
        assertEquals(0.0, options.sessionReplay.sessionSampleRate ?: 0.0, 0.0)
        assertEquals(0.0, options.sessionReplay.onErrorSampleRate ?: 0.0, 0.0)
        assertEquals(0.0, options.tracesSampleRate ?: 0.0, 0.0)
        assertFalse(options.isEnableAutoSessionTracking)
        assertFalse(options.isEnableUserInteractionBreadcrumbs)
        assertFalse(options.isEnableUserInteractionTracing)
        assertFalse(options.isEnableNetworkEventBreadcrumbs)
    }

    @Test
    fun `beforeSend removes identity, emails and tokens`() {
        val event = SentryEvent().apply {
            user = User().apply { id = "1b4c2e74"; this.email = this@CrashReportingTest.email }
            message = Message().apply { formatted = "login failed for $email" }
            exceptions = listOf(SentryException().apply { value = "bad token $jwt for $email" })
        }
        val sent = configured().beforeSend!!.execute(event, Hint())
        assertNotNull(sent)
        assertNull(sent!!.user)
        val text = sent.message!!.formatted + sent.exceptions!![0].value
        assertFalse(text, text.contains("eyJ"))
        assertFalse(text, text.contains("gonzalez"))
        assertTrue(text, text.contains("[redacted]"))
    }

    @Test
    fun `beforeBreadcrumb scrubs the message and drops the data`() {
        val crumb = Breadcrumb("GET /x?token=$jwt by $email").apply { setData("url", "https://x/?e=$email") }
        val sent = configured().beforeBreadcrumb!!.execute(crumb, Hint())!!
        assertFalse(sent.message!!.contains("eyJ"))
        assertFalse(sent.message!!.contains("gonzalez"))
        assertTrue(sent.data.isEmpty())
    }

    @Test
    fun `scrubText leaves ordinary error text alone`() {
        val text = "NullPointerException: Attempt to invoke virtual method on LessonScreen"
        assertEquals(text, CrashReporting.scrubText(text))
    }

    @Test
    fun `beforeSend removes the install id, device name and app hash`() {
        val event = SentryEvent().apply {
            contexts.setDevice(Device().apply { id = "install-1234"; name = "Maria's Pixel" })
            contexts.setApp(App().apply { deviceAppHash = "a1b2c3d4" })
            serverName = "maria-pixel"
        }
        val sent = configured().beforeSend!!.execute(event, Hint())!!
        assertNull(sent.contexts.device?.id)
        assertNull(sent.contexts.device?.name)
        assertNull(sent.contexts.app?.deviceAppHash)
        assertNull(sent.serverName)
    }

    @Test
    fun `scrubText redacts URL parameters, secret keys and account ids`() {
        val id = "1b4c2e74-9d6a-4c96-a0e5-77e816a6e4f2"
        val text = CrashReporting.scrubText(
            "GET https://x.supabase.co/rest/v1/t?user_id=eq.$id&access_token=abc123 key sb_secret_AbCdEf1234567890 sk_live_AbCdEf123456",
        )
        assertFalse(text, text.contains(id))
        assertFalse(text, text.contains("abc123"))
        assertFalse(text, text.contains("AbCdEf"))
    }
}
