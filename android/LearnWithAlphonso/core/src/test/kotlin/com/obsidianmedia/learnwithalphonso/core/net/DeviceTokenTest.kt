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
    fun `register claims the token through the server function with the android platform`() = runTest {
        val fake = FakeSupabase { json("", HttpStatusCode.OK) }
        ProgressSyncClient(fake.http) { now }.registerDeviceToken("fcm-token-1")
        val req = fake.seen.single()
        assertEquals("POST", req.method)
        assertEquals("/rest/v1/rpc/claim_device_token", req.path)
        assertEquals("""{"_token":"fcm-token-1","_platform":"android"}""", req.body)
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
