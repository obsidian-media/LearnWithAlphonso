package com.obsidianmedia.learnwithalphonso.ui.settings

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import kotlin.random.Random

class IdentityViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server() = FakeServer { req -> if (req.method == "GET") json("""[{"display_name":"Ana","avatar_seed":"ab12cd34"}]""") else json("") }

    @Test
    fun `loads identity, saves a trimmed capped name, and shuffles an 8-hex seed`() = runBlocking {
        val s = server()
        val v = IdentityViewModel(s.progressClient, "u1", Random(3))
        awaitTrue("loaded") { v.state.value.displayName == "Ana" }
        v.editName("  " + "x".repeat(60))
        assertEquals(40, v.state.value.displayName.length)
        v.editName("  Ana Banana  ")
        v.saveName()
        awaitTrue("saved") { !v.state.value.saving && v.state.value.displayName == "Ana Banana" }
        assertEquals("""{"display_name":"Ana Banana"}""", s.seen.first { it.method == "PATCH" }.body)
        v.shuffleAvatar()
        awaitTrue("shuffled") { !v.state.value.shuffling && v.state.value.avatarSeed != "ab12cd34" }
        assertTrue(v.state.value.avatarSeed.matches(Regex("[0-9a-f]{8}")))
        assertTrue(s.seen.any { it.method == "PATCH" && it.body.startsWith("""{"avatar_seed":"""") })
    }
}
