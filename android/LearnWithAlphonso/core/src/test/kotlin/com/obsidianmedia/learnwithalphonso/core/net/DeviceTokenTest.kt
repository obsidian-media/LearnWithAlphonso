package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class DeviceTokenTest {
    private val now = 1_758_000_000_000L

    @Test
    fun `register upserts on user and token with the android platform`() = runTest {
        val fake = FakeSupabase { json("", HttpStatusCode.Created) }
        ProgressSyncClient(fake.http) { now }.registerDeviceToken("fcm-token-1")
        val req = fake.seen.single()
        assertEquals("POST", req.method)
        assertEquals("/rest/v1/device_tokens", req.path)
        assertEquals("user_id,token", req.query["on_conflict"])
        assertEquals("resolution=merge-duplicates,return=minimal", req.headers["Prefer"])
        assertEquals("""{"token":"fcm-token-1","platform":"android","updated_at":"2025-09-16T05:20:00Z"}""", req.body)
    }

    @Test
    fun `unregister deletes this device's own row and a server error surfaces`() = runTest {
        val fake = FakeSupabase { json("", HttpStatusCode.NoContent) }
        ProgressSyncClient(fake.http) { now }.unregisterDeviceToken("fcm-token-1")
        val req = fake.seen.single()
        assertEquals("DELETE", req.method)
        assertEquals("eq.fcm-token-1", req.query["token"])
        val failing = FakeSupabase { json("""{"message":"nope"}""", HttpStatusCode.InternalServerError) }
        assertThrows<ProgressSyncError.Server> { ProgressSyncClient(failing.http) { now }.registerDeviceToken("t") }
    }
}
