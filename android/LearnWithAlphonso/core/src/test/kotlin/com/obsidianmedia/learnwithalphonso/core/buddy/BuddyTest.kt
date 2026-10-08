package com.obsidianmedia.learnwithalphonso.core.buddy

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.cancelBuddyRequest
import com.obsidianmedia.learnwithalphonso.core.net.endBuddy
import com.obsidianmedia.learnwithalphonso.core.net.getBuddyRequests
import com.obsidianmedia.learnwithalphonso.core.net.getBuddyMessages
import com.obsidianmedia.learnwithalphonso.core.net.getBuddyPool
import com.obsidianmedia.learnwithalphonso.core.net.joinBuddyPool
import com.obsidianmedia.learnwithalphonso.core.net.leaveBuddyPool
import com.obsidianmedia.learnwithalphonso.core.net.getMyBuddy
import com.obsidianmedia.learnwithalphonso.core.net.requestBuddy
import com.obsidianmedia.learnwithalphonso.core.net.respondBuddyRequest
import com.obsidianmedia.learnwithalphonso.core.net.sendBuddyMessage
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Reads the SAME fixtures the web and iOS tests pin (core/src/test/resources/buddy.fixtures.json is a byte-for-byte
 * copy, guarded by src/lib/buddy-native-fixtures.test.ts): the week rules, the server statuses' wording and the card
 * wording must be word-for-word src/lib/buddy.ts.
 */
class BuddyTest {
    private val root: JsonObject =
        Json.parseToJsonElement(javaClass.getResource("/buddy.fixtures.json")!!.readText()).jsonObject

    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http) { 0L }

    @Test
    fun `week rules match every fixture case`() {
        val cases = root["resolve"]!!.jsonArray
        assertTrue(cases.size >= 6)
        for (case in cases) {
            val c = case.jsonObject
            val name = c["name"]!!.jsonPrimitive.content
            val state = c["state"]!!.jsonObject
            val counts = c["counts"]!!.jsonObject
            val expected = c["expected"]!!.jsonObject
            val result = BuddyRules.resolveWeek(
                streakWeeks = state["streakWeeks"]!!.jsonPrimitive.int,
                graceAvailable = state["graceAvailable"]!!.jsonPrimitive.boolean,
                a = counts["a"]!!.jsonPrimitive.int,
                b = counts["b"]!!.jsonPrimitive.int,
                isFirstWeek = c["isFirstWeek"]!!.jsonPrimitive.boolean,
            )
            assertEquals(expected["outcome"]!!.jsonPrimitive.content, result.outcome, name)
            assertEquals(expected["streakWeeks"]!!.jsonPrimitive.int, result.streakWeeks, name)
            assertEquals(expected["graceAvailable"]!!.jsonPrimitive.boolean, result.graceAvailable, name)
        }
        assertEquals(3, BuddyRules.GOAL)
    }

    @Test
    fun `every server status has the web wording and an unknown one falls back`() {
        val messages = root["messages"]!!.jsonObject
        assertTrue(messages.size >= 14)
        for ((status, text) in messages) assertEquals(text.jsonPrimitive.content, BuddyCopy.statusMessage(status), status)
        assertEquals(messages["unknown"]!!.jsonPrimitive.content, BuddyCopy.statusMessage("something_new"))
    }

    @Test
    fun `week lines and card wording match the web`() {
        for (line in root["weekLines"]!!.jsonArray) {
            val l = line.jsonObject
            assertEquals(
                l["expected"]!!.jsonPrimitive.content,
                BuddyCopy.weekLine(l["my"]!!.jsonPrimitive.int, l["buddy"]!!.jsonPrimitive.int, l["goal"]!!.jsonPrimitive.int),
            )
        }
        val copy = root["copy"]!!.jsonObject
        assertEquals(copy["intro"]!!.jsonPrimitive.content, BuddyCopy.INTRO)
        assertEquals(copy["loadFailed"]!!.jsonPrimitive.content, BuddyCopy.LOAD_FAILED)
        for (s in copy["streakLines"]!!.jsonArray) {
            assertEquals(s.jsonObject["expected"]!!.jsonPrimitive.content, BuddyCopy.streakLine(s.jsonObject["weeks"]!!.jsonPrimitive.int))
        }
        for (g in copy["graceLines"]!!.jsonArray) {
            assertEquals(g.jsonObject["expected"]!!.jsonPrimitive.content, BuddyCopy.graceLine(g.jsonObject["available"]!!.jsonPrimitive.boolean))
        }
        fun pair(key: String) = copy[key]!!.jsonObject.let { it["name"]!!.jsonPrimitive.content to it["expected"]!!.jsonPrimitive.content }
        pair("incoming").let { (name, expected) -> assertEquals(expected, BuddyCopy.incomingLine(name)) }
        pair("outgoing").let { (name, expected) -> assertEquals(expected, BuddyCopy.outgoingLine(name)) }
        pair("endConfirm").let { (name, expected) -> assertEquals(expected, BuddyCopy.endConfirm(name)) }
    }

    private val buddyRow =
        """{"pair_id":"p1","buddy_id":"u2","buddy_name":"Bo","buddy_avatar_seed":"cd","paired_at":"2026-10-01T00:00:00+00:00",
           "week_start":"2026-10-05","my_count":2,"buddy_count":3,"goal":3,"streak_weeks":4,"grace_available":false,"last_outcome":null}"""

    @Test
    fun `getMyBuddy is null without a buddy and decodes a row`() = runTest {
        val none = FakeSupabase { json("[]") }
        assertNull(client(none).getMyBuddy())
        assertEquals("/rest/v1/rpc/get_my_buddy", none.seen.single().path)

        val buddy = client(FakeSupabase { json("[$buddyRow]") }).getMyBuddy()!!
        assertEquals("Bo", buddy.buddyName)
        assertEquals(2, buddy.myCount)
        assertEquals(3, buddy.buddyCount)
        assertEquals(4, buddy.streakWeeks)
        assertEquals(false, buddy.graceAvailable)
        assertNull(buddy.lastOutcome)
    }

    @Test
    fun `getMyBuddy throws on a server error or a malformed row instead of looking like no buddy`() = runTest {
        // A well-formed empty array with a 500: only the status can make the first case throw.
        assertThrows(Exception::class.java) {
            kotlinx.coroutines.runBlocking { client(FakeSupabase { json("[]", HttpStatusCode.InternalServerError) }).getMyBuddy() }
        }
        assertThrows(Exception::class.java) {
            kotlinx.coroutines.runBlocking { client(FakeSupabase { json("""[{"pair_id":"p1"}]""") }).getMyBuddy() }
        }
        // "eight" (not "8": kotlinx reads a numeric string as a number) is a genuinely mistyped count.
        val mistyped = buddyRow.replace("\"my_count\":2", "\"my_count\":\"eight\"")
        assertThrows(Exception::class.java) {
            kotlinx.coroutines.runBlocking { client(FakeSupabase { json("[$mistyped]") }).getMyBuddy() }
        }
    }

    @Test
    fun `getMyBuddy rejects a missing or non-string last_outcome`() = runTest {
        val missing = buddyRow.replace(",\"last_outcome\":null", "")
        val mistyped = buddyRow.replace("\"last_outcome\":null", "\"last_outcome\":3")
        for (row in listOf(missing, mistyped)) {
            assertThrows(Exception::class.java) {
                kotlinx.coroutines.runBlocking { client(FakeSupabase { json("[$row]") }).getMyBuddy() }
            }
        }
        val named = buddyRow.replace("\"last_outcome\":null", "\"last_outcome\":\"hit\"")
        assertEquals("hit", client(FakeSupabase { json("[$named]") }).getMyBuddy()!!.lastOutcome)
    }

    @Test
    fun `getBuddyRequests decodes both directions and rejects an unknown one`() = runTest {
        val row = """{"request_id":"r1","direction":"incoming","other_id":"u2","other_name":"Bo","other_avatar_seed":"cd","requested_at":"2026-10-06T00:00:00+00:00"}"""
        val requests = client(FakeSupabase { json("[$row, ${row.replace("r1", "r2").replace("incoming", "outgoing")}]") }).getBuddyRequests()
        assertEquals(listOf("r1", "r2"), requests.map { it.requestId })
        assertEquals(listOf(BuddyRequest.Direction.INCOMING, BuddyRequest.Direction.OUTGOING), requests.map { it.direction })
        assertThrows(Exception::class.java) {
            kotlinx.coroutines.runBlocking { client(FakeSupabase { json("[${row.replace("incoming", "sideways")}]") }).getBuddyRequests() }
        }
    }

    @Test
    fun `mutations post their arguments and return the server status, or unknown without a row`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("request_buddy") -> json("""[{"status":"friend_paired"}]""")
                req.path.endsWith("respond_buddy_request") -> json("""[{"status":"declined"}]""")
                req.path.endsWith("cancel_buddy_request") -> json("""[{"status":"cancelled"}]""")
                else -> json("[]")
            }
        }
        val c = client(fake)
        assertEquals("friend_paired", c.requestBuddy("u2"))
        assertEquals("declined", c.respondBuddyRequest("r1", accept = false))
        assertEquals("cancelled", c.cancelBuddyRequest("r2"))
        assertEquals("unknown", c.endBuddy())
        assertEquals("""{"_friend":"u2"}""", fake.seen[0].body)
        assertEquals("""{"_request":"r1","_accept":false}""", fake.seen[1].body)
        assertEquals("""{"_request":"r2"}""", fake.seen[2].body)
        assertEquals("/rest/v1/rpc/end_buddy", fake.seen[3].path)
    }

    @Test
    fun `presets, the hourly limit and message lines match the web`() {
        val presets = root["presets"]!!.jsonArray.map { it.jsonObject }
        assertEquals(presets.map { it["id"]!!.jsonPrimitive.content }, BuddyCopy.PRESETS.map { it.id })
        assertEquals(presets.map { it["text"]!!.jsonPrimitive.content }, BuddyCopy.PRESETS.map { it.text })
        assertNull(BuddyCopy.presetText("hi there"))
        assertEquals(root["messagesPerHour"]!!.jsonPrimitive.int, BuddyCopy.MESSAGES_PER_HOUR)
        for (line in root["messageLines"]!!.jsonArray) {
            val l = line.jsonObject
            val expected = l["expected"]!!.let { if (it is kotlinx.serialization.json.JsonNull) null else it.jsonPrimitive.content }
            assertEquals(
                expected,
                BuddyCopy.messageLine(l["isMine"]!!.jsonPrimitive.boolean, l["buddyName"]!!.jsonPrimitive.content, l["presetId"]!!.jsonPrimitive.content),
            )
        }
    }

    @Test
    fun `sending posts the preset id, reading decodes rows and throws on a server error`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("send_buddy_message") -> json("""[{"status":"rate_limited"}]""")
                req.path.endsWith("get_buddy_messages") ->
                    json("""[{"message_id":"m1","sender_id":"u2","is_mine":false,"preset_id":"nice_work","sent_at":"2026-10-07T00:00:00+00:00"}]""")
                else -> json("[]")
            }
        }
        assertEquals("rate_limited", client(fake).sendBuddyMessage("nice_work"))
        assertEquals("""{"_preset":"nice_work"}""", fake.seen[0].body)
        val messages = client(fake).getBuddyMessages()
        assertEquals(listOf("nice_work"), messages.map { it.presetId })
        assertEquals(false, messages.single().isMine)
        assertThrows(Exception::class.java) {
            kotlinx.coroutines.runBlocking { client(FakeSupabase { json("[]", HttpStatusCode.InternalServerError) }).getBuddyMessages() }
        }
    }

    @Test
    fun `matching wording matches the web`() {
        val copy = root["copy"]!!.jsonObject
        assertEquals(copy["poolIntro"]!!.jsonPrimitive.content, BuddyCopy.POOL_INTRO)
        assertEquals(copy["stopLooking"]!!.jsonPrimitive.content, BuddyCopy.STOP_LOOKING)
        assertEquals(copy["matchedLabel"]!!.jsonPrimitive.content, BuddyCopy.MATCHED_LABEL)
        assertEquals(copy["ageConfirm"]!!.jsonPrimitive.content, BuddyCopy.AGE_CONFIRM)
        for ((code, name) in copy["courseNames"]!!.jsonObject) assertEquals(name.jsonPrimitive.content, BuddyCopy.courseName(code))
        val find = copy["findButton"]!!.jsonObject
        assertEquals(find["expected"]!!.jsonPrimitive.content, BuddyCopy.findButton(find["course"]!!.jsonPrimitive.content))
        val waiting = copy["waitingLine"]!!.jsonObject
        assertEquals(waiting["expected"]!!.jsonPrimitive.content, BuddyCopy.waitingLine(waiting["course"]!!.jsonPrimitive.content))
    }

    @Test
    fun `a matched pair is muted only while matching is off`() {
        val base = MyBuddy("p", "u2", "Bo", "cd", "t", "w", 0, 0, 3, 0, true, null, isMatch = true, matchingEnabled = false)
        assertFalse(base.canSendPresets)
        assertTrue(base.copy(matchingEnabled = true).canSendPresets)
        assertTrue(base.copy(isMatch = false).canSendPresets)
    }

    @Test
    fun `matching_enabled is read, and missing means on`() = runTest {
        val off = buddyRow.replace("\"last_outcome\":null", "\"last_outcome\":null,\"is_match\":true,\"matching_enabled\":false")
        assertEquals(false, client(FakeSupabase { json("[$off]") }).getMyBuddy()!!.matchingEnabled)
        assertEquals(true, client(FakeSupabase { json("[$buddyRow]") }).getMyBuddy()!!.matchingEnabled)
    }

    @Test
    fun `isMatch is read, and missing means a friend pair`() = runTest {
        val matched = buddyRow.replace("\"last_outcome\":null", "\"last_outcome\":null,\"is_match\":true")
        assertEquals(true, client(FakeSupabase { json("[$matched]") }).getMyBuddy()!!.isMatch)
        assertEquals(false, client(FakeSupabase { json("[$buddyRow]") }).getMyBuddy()!!.isMatch)
    }

    @Test
    fun `matching calls post the course, read the pool and throw on a server error`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("join_buddy_pool") -> json("""[{"status":"waiting"}]""")
                req.path.endsWith("leave_buddy_pool") -> json("""[{"status":"left"}]""")
                req.path.endsWith("get_buddy_pool") -> json("""[{"matching_enabled":true,"waiting":true,"course":"fr","courses":["en","fr"]}]""")
                else -> json("[]")
            }
        }
        assertEquals("waiting", client(fake).joinBuddyPool("fr", ageConfirmed = true))
        assertEquals("""{"_course":"fr","_age_confirmed":true}""", fake.seen[0].body)
        assertEquals("left", client(fake).leaveBuddyPool())
        val pool = client(fake).getBuddyPool()
        assertEquals(true, pool.matchingEnabled)
        assertEquals("fr", pool.course)
        assertEquals(listOf("en", "fr"), pool.courses)
        assertThrows(Exception::class.java) {
            kotlinx.coroutines.runBlocking { client(FakeSupabase { json("[]", HttpStatusCode.InternalServerError) }).getBuddyPool() }
        }
    }
}

