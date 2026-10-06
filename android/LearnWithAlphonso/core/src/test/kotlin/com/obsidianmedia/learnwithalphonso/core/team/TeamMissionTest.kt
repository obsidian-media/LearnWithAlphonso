package com.obsidianmedia.learnwithalphonso.core.team

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncError
import com.obsidianmedia.learnwithalphonso.core.net.getTeamMission
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Decodes the SAME fixtures the web and iOS tests pin (core/src/test/resources/team-mission.fixtures.json is a
 * byte-for-byte copy, guarded by src/lib/team-mission-ios-fixtures.test.ts), so a rename, a retype or a wording
 * change on the server or the web fails here too. The wording must match src/lib/team-mission.ts.
 */
class TeamMissionTest {
    private val root: JsonObject = Json.parseToJsonElement(javaClass.getResource("/team-mission.fixtures.json")!!.readText()).jsonObject
    private val defaultNow = Instant.parse(root["now"]!!.jsonPrimitive.content).toEpochMilli()

    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http) { defaultNow }

    private suspend fun missionFor(row: JsonObject, nowMillis: Long): TeamMission? =
        client(FakeSupabase { json(JsonArray(listOf(row)).toString()) }).getTeamMission(nowMillis)

    private fun baseRow(): MutableMap<String, kotlinx.serialization.json.JsonElement> =
        Json.parseToJsonElement(
            """{"team_id":"t1","week_start":"2026-10-05","week_end":"2026-10-12","target":8,"total":3,"my_count":2,
               "member_count":2,"status":"in_progress","reward_xp":50,"rewarded":false}""",
        ).jsonObject.toMutableMap()

    @Test
    fun `every fixture case decodes to the web view model`() = runTest {
        val cases = root["cases"]!!.jsonArray
        assertTrue(cases.size >= 9)
        for (case in cases) {
            val c = case.jsonObject
            val name = c["name"]!!.jsonPrimitive.content
            val now = c["now"]?.let { Instant.parse(it.jsonPrimitive.content).toEpochMilli() } ?: defaultNow
            val e = c["expected"]!!.jsonObject
            val m = missionFor(c["row"]!!.jsonObject, now)!!
            assertEquals(e["teamId"]!!.jsonPrimitive.content, m.teamId, name)
            assertEquals(e["weekStart"]!!.jsonPrimitive.content, m.weekStart, name)
            assertEquals(e["weekEnd"]!!.jsonPrimitive.content, m.weekEnd, name)
            assertEquals(e["target"]!!.jsonPrimitive.int, m.target, name)
            assertEquals(e["total"]!!.jsonPrimitive.int, m.total, name)
            assertEquals(e["myCount"]!!.jsonPrimitive.int, m.myCount, name)
            assertEquals(e["memberCount"]!!.jsonPrimitive.int, m.memberCount, name)
            assertEquals(e["status"]!!.jsonPrimitive.content, m.status.wire, name)
            assertEquals(e["rewardXp"]!!.jsonPrimitive.int, m.rewardXp, name)
            assertEquals(e["rewarded"]!!.jsonPrimitive.boolean, m.rewarded, name)
            assertEquals(e["daysLeft"]!!.jsonPrimitive.int, m.daysLeft, name)
            assertEquals(e["percent"]!!.jsonPrimitive.int, m.percent, name)
            assertEquals(e["headline"]!!.jsonPrimitive.content, m.headline, name)
            assertEquals(e["footer"]!!.jsonPrimitive.content, m.footer, name)
        }
    }

    @Test
    fun `never reports negative days left`() = runTest {
        val row = baseRow().apply { put("week_end", kotlinx.serialization.json.JsonPrimitive("2026-10-01")) }
        assertEquals(0, missionFor(JsonObject(row), defaultNow)!!.daysLeft)
    }

    @Test
    fun `an unknown status from a newer server reads as in progress`() = runTest {
        val row = baseRow().apply { put("status", kotlinx.serialization.json.JsonPrimitive("weird")) }
        assertEquals(TeamMissionStatus.IN_PROGRESS, missionFor(JsonObject(row), defaultNow)!!.status)
    }

    @Test
    fun `a zero target never divides by zero`() = runTest {
        val row = baseRow().apply { put("target", kotlinx.serialization.json.JsonPrimitive(0)) }
        assertEquals(0, missionFor(JsonObject(row), defaultNow)!!.percent)
    }

    @Test
    fun `percent rounds down so 99 point 9 never reads as done`() = runTest {
        val row = baseRow().apply {
            put("total", kotlinx.serialization.json.JsonPrimitive(799))
            put("target", kotlinx.serialization.json.JsonPrimitive(800))
        }
        assertEquals(99, missionFor(JsonObject(row), defaultNow)!!.percent)
    }

    @Test
    fun `a row missing a required field is a contract break, not no team`() = runTest {
        for (key in listOf("team_id", "week_start", "week_end", "target", "total", "my_count", "member_count", "reward_xp", "rewarded")) {
            val row = baseRow().apply { remove(key) }
            val error = runCatching { missionFor(JsonObject(row), defaultNow) }.exceptionOrNull()
            assertTrue(error is ProgressSyncError.InvalidPayload, key)
        }
    }

    @Test
    fun `a mistyped field or an impossible date is a contract break`() = runTest {
        // "eight", not "8": the shared client helper reads a numeric string as a number (PostgREST never sends one for an
        // integer column), so only a value that is not a number at all is a contract break.
        val wrongType = baseRow().apply { put("target", kotlinx.serialization.json.JsonPrimitive("eight")) }
        assertTrue(runCatching { missionFor(JsonObject(wrongType), defaultNow) }.exceptionOrNull() is ProgressSyncError.InvalidPayload)
        val badDate = baseRow().apply { put("week_end", kotlinx.serialization.json.JsonPrimitive("2026-02-30")) }
        assertTrue(runCatching { missionFor(JsonObject(badDate), defaultNow) }.exceptionOrNull() is ProgressSyncError.InvalidPayload)
    }

    @Test
    fun `posts to the rpc with the users token and returns null without a team`() = runTest {
        val fake = FakeSupabase { json("[]") }
        assertNull(client(fake).getTeamMission(defaultNow))
        val request = fake.seen.single()
        assertEquals("POST", request.method)
        assertEquals("/rest/v1/rpc/get_team_mission", request.path)
        assertEquals("publishable-key", request.headers["apikey"])
        assertEquals("Bearer user-access-token", request.headers["Authorization"])
    }

    @Test
    fun `a server error throws instead of looking like no team`() = runTest {
        val fake = FakeSupabase { json("""{"message":"boom"}""", HttpStatusCode.InternalServerError) }
        val error = runCatching { client(fake).getTeamMission(defaultNow) }.exceptionOrNull()
        assertTrue(error is ProgressSyncError.Server)
    }

    @Test
    fun `a body that is not an array throws invalid payload`() = runTest {
        val fake = FakeSupabase { json("""{"not":"an array"}""") }
        val error = runCatching { client(fake).getTeamMission(defaultNow) }.exceptionOrNull()
        assertTrue(error is ProgressSyncError.InvalidPayload)
    }
}
