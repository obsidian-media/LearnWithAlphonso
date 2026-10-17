package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class NameOnboardingClientTest {
    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http)

    @Test
    fun `name status is confirmed when the column holds a value, whatever its format`() = runTest {
        val confirmed = FakeSupabase { json("""[{"display_name":"Ana","name_confirmed_at":"some odd format"}]""") }
        val status = client(confirmed).fetchNameStatus()!!
        assertEquals("Ana", status.displayName)
        assertFalse(status.needsPrompt)
        assertEquals("/rest/v1/rpc/get_my_name_status", confirmed.seen.single().path)
        val unconfirmed = FakeSupabase { json("""[{"display_name":"Learner-4F2A","name_confirmed_at":null}]""") }
        assertTrue(client(unconfirmed).fetchNameStatus()!!.needsPrompt)
    }

    @Test
    fun `no profile row is null, a failure is thrown not read as confirmed`() = runTest {
        assertNull(client(FakeSupabase { json("[]") }).fetchNameStatus())
        val broken = FakeSupabase { json("""{"message":"boom"}""", HttpStatusCode.InternalServerError) }
        assertThrows(ProgressSyncError.Server::class.java) { kotlinx.coroutines.runBlocking { client(broken).fetchNameStatus() } }
    }

    @Test
    fun `display_name_problem returns the code, or null when allowed`() = runTest {
        val blocked = FakeSupabase { json(""""blocked-content"""") }
        assertEquals("blocked-content", client(blocked).displayNameProblem("Bad"))
        assertEquals("""{"_name":"Bad"}""", blocked.seen.single().body)
        assertNull(client(FakeSupabase { json("null") }).displayNameProblem("Ana"))
        assertNull(client(FakeSupabase { json("") }).displayNameProblem("Ana"))
    }

    @Test
    fun `confirm_display_name returns the stored name and a refusal carries its code`() = runTest {
        val ok = FakeSupabase { json(""""Ana Lima"""") }
        assertEquals("Ana Lima", client(ok).confirmDisplayName("Ana  Lima"))
        assertEquals("/rest/v1/rpc/confirm_display_name", ok.seen.single().path)
        val refused = FakeSupabase { json("""{"code":"P0001","message":"blocked-content"}""", HttpStatusCode.BadRequest) }
        val e = assertThrows(ProgressSyncError.Server::class.java) { kotlinx.coroutines.runBlocking { client(refused).confirmDisplayName("Bad") } }
        assertEquals("blocked-content", e.serverMessage)
    }

    @Test
    fun `skip_display_name_prompt returns the stored handle`() = runTest {
        val fake = FakeSupabase { json(""""Learner-4F2A"""") }
        assertEquals("Learner-4F2A", client(fake).skipDisplayNamePrompt())
        assertEquals("/rest/v1/rpc/skip_display_name_prompt", fake.seen.single().path)
        assertEquals("{}", fake.seen.single().body)
    }

    @Test
    fun `an unexpected shape is an invalid payload`() = runTest {
        assertThrows(ProgressSyncError.InvalidPayload::class.java) { kotlinx.coroutines.runBlocking { client(FakeSupabase { json("42") }).confirmDisplayName("Ana") } }
    }
}
