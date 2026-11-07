package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.*
import com.obsidianmedia.learnwithalphonso.core.net.*
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class PracticeHubTest {
    private fun scenario(id: String, level: String = "Beginner") = Scenario(id = id, title = "Test", emoji = "", blurb = "", level = level, systemPrompt = "p", opener = "Hi")
    private fun campaign(id: String) = Campaign(id, "Test", "", "", "Beginner", "p", listOf("a", "b", "c").map { CampaignScene(id = it, title = "Scene", systemPrompt = "p", opener = "Hi", minTurns = 3) })
    @Test fun `today skips written-only even when spelling is worst`() {
        val events = listOf(PracticeWeaknessEvent("spelling", "detected", "3"), PracticeWeaknessEvent("spelling", "detected", "2"), PracticeWeaknessEvent("articles", "detected", "1"))
        val scenarios = listOf(scenario("airport"), scenario("coffee"))
        assertEquals(PracticePick("coffee", "articles"), PracticeHub.today(PracticeHubData(weaknessEvents = events), scenarios))
        assertEquals(PracticePick("airport", null), PracticeHub.today(PracticeHubData(weaknessEvents = events.take(1)), scenarios))
    }
    @Test fun `stars displayed are server award even when counts and best suggest three`() {
        val r = ContentJson.json.decodeFromString<PracticeResult>(resultJson)
        assertEquals(1, r.displayedStars)
        assertEquals("Try for 2", r.retryLabel)
        assertEquals("1 of 3 stars", PracticeHub.starLabel(r.displayedStars))
        assertEquals(2, PracticeHub.stars(listOf(PracticeStarRow("scene", "coffee", 3, "1"), PracticeStarRow("scenario", "coffee", 2, "1")), "scenario", "coffee"))
    }
    @Test fun `continue most recent unfinished campaign first unstarred scene`() {
        val rows = listOf(PracticeStarRow("scene", "older/a", 3, "1"), PracticeStarRow("scene", "new/a", 1, "8"), PracticeStarRow("scene", "new/c", 3, "7"), PracticeStarRow("scenario", "coffee", 3, "9"))
        val campaigns = listOf(campaign("older"), campaign("new"))
        assertEquals(PracticeContinue("new", 1), PracticeHub.resume(rows, campaigns))
        val completed = rows + PracticeStarRow("scene", "new/b", 1, "10")
        assertEquals(PracticeContinue("older", 1), PracticeHub.resume(completed, campaigns))
        assertEquals(0, PracticeHub.nextScene(campaigns[1], completed))
    }
    @Test fun `chips and level pick do not lock advanced and prefer least starred`() {
        val scenarios = listOf(scenario("coffee"), scenario("airport"), scenario("debate", "Advanced"))
        assertEquals(3, PracticeHub.filtered(scenarios, "All").size)
        assertEquals(listOf("debate"), PracticeHub.filtered(scenarios, "Advanced").map { it.id })
        assertEquals("debate", PracticeHub.today(PracticeHubData(cefrLevel = "C1"), scenarios)?.scenarioId)
        assertEquals("airport", PracticeHub.today(PracticeHubData(stars = listOf(PracticeStarRow("scenario", "coffee", 2, "1"))), scenarios)?.scenarioId)
    }
    @Test fun `finish posts only call id and chat carries it`() = runTest {
        val client = AiConversationClient(ApiHttp("https://example.test", { "token" }, MockEngine { req ->
            assertEquals("Bearer token", req.headers["Authorization"])
            val body = ContentJson.json.parseToJsonElement(req.body.toByteArray().decodeToString()).jsonObject
            assertEquals("random-call", body["callId"]?.jsonPrimitive?.content)
            val finish = req.url.encodedPath == "/api/practice"
            if (finish) assertEquals(setOf("callId"), body.keys)
            respond(if (finish) resultJson else """{"content":"Reply","verdict":"correct"}""")
        }))
        client.chatReply(listOf(ChatMessage("user", "Hi")), callId = "random-call")
        assertEquals(1, client.finishPractice("random-call").displayedStars)
    }
    @Test fun `slip hidden when every reply right`() {
        val clean = ContentJson.json.decodeFromString<PracticeResult>("""{"kind":"scenario","itemKey":"coffee","stars":3,"bestBefore":0,"bestAfter":3,"replies":8,"rightReplies":8,"shortReplies":0,"englishReplies":0,"finishMinReplies":3}""")
        assertEquals(null, clean.slipToShow("Soy cansado" to "Estoy cansado"))
        val slipped = ContentJson.json.decodeFromString<PracticeResult>(resultJson.replace("\"rightReplies\":5", "\"rightReplies\":4"))
        assertEquals("a" to "b", slipped.slipToShow("a" to "b"))
    }
    private val resultJson = """{"kind":"scenario","itemKey":"coffee","stars":1,"bestBefore":3,"bestAfter":3,"replies":5,"rightReplies":5,"shortReplies":0,"englishReplies":0,"finishMinReplies":3}"""
}
