package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.ReferralClaimReason
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralClaimResult
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ReferralClientTest {
    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http) { 0L }

    @Test
    fun `claim_referral posts the code and reads a success`() = runTest {
        val fake = FakeSupabase { json("""[{"ok":true,"reason":null}]""") }
        assertEquals(ReferralClaimResult.Claimed, client(fake).claimReferral("abcd1234"))
        val req = fake.seen.single()
        assertEquals("POST", req.method)
        assertEquals("/rest/v1/rpc/claim_referral", req.path)
        assertEquals("""{"_code":"abcd1234"}""", req.body)
    }

    @Test
    fun `each server reason maps to a refusal`() = runTest {
        for (reason in ReferralClaimReason.entries) {
            val fake = FakeSupabase { json("""[{"ok":false,"reason":"${reason.raw}"}]""") }
            assertEquals(ReferralClaimResult.Refused(reason), client(fake).claimReferral("abcd1234"), reason.raw)
        }
    }

    @Test
    fun `a server failure, an odd answer or an empty answer is an error`() = runTest {
        val failing = FakeSupabase { json("""{"message":"boom"}""", HttpStatusCode.InternalServerError) }
        val odd = FakeSupabase { json("""[{"ok":false,"reason":"something-new"}]""") }
        val empty = FakeSupabase { json("[]") }
        val notJson = FakeSupabase { json("oops") }
        for (fake in listOf(failing, odd, empty, notJson)) {
            assertEquals(ReferralClaimResult.Error, client(fake).claimReferral("abcd1234"))
        }
    }

    @Test
    fun `referral rows are read for the referrer only`() = runTest {
        val fake = FakeSupabase {
            json("""[{"status":"completed","capped":false,"completed_at":"2026-11-20T10:00:00.123456+00:00"},{"status":"pending","capped":false,"completed_at":null}]""")
        }
        val rows = client(fake).fetchReferralRows("u-1")
        assertEquals(2, rows.size)
        assertEquals("completed", rows[0].status)
        assertNotNull(rows[0].completedAtMillis)
        assertNull(rows[1].completedAtMillis)
        val req = fake.seen.single()
        assertEquals("/rest/v1/referrals", req.path)
        assertEquals("eq.u-1", req.query["referrer_id"])
    }
}
