package com.obsidianmedia.learnwithalphonso.core.voice

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VoiceCatalogTest {
    @Test
    fun `allow-list sizes per course and unique ids`() {
        assertEquals(32, VoiceCatalog.voicesFor("en").size)
        assertEquals(15, VoiceCatalog.voicesFor("es").size)
        assertEquals(listOf("aura-2-agathe-fr", "aura-2-hector-fr"), VoiceCatalog.voicesFor("fr").map { it.id })
        assertEquals(VoiceCatalog.all.size, VoiceCatalog.all.map { it.id }.toSet().size)
    }

    @Test
    fun `every default is on its course's list`() {
        VoiceCharacter.entries.forEach { c ->
            VoiceCatalog.courses.forEach { course -> assertTrue(VoiceCatalog.isAllowed(VoiceCatalog.defaultVoice(c, course), course)) }
        }
        assertEquals("aura-2-hector-fr", VoiceCatalog.defaultVoice(VoiceCharacter.Alphonso, "fr"))
        assertEquals("aura-2-alvaro-es", VoiceCatalog.defaultVoice(VoiceCharacter.Hector, "es"))
    }

    @Test
    fun `the course is checked and valentina is out`() {
        assertTrue(VoiceCatalog.isAllowed("aura-2-hector-fr", "fr"))
        assertFalse(VoiceCatalog.isAllowed("aura-2-hector-fr", "es"))
        assertFalse(VoiceCatalog.isAllowed("aura-2-valentina-es", "es"))
        assertEquals("https://learn.alphonsoecosystem.app/voices/aura-2-diana-es.mp3", VoiceCatalog.previewUrl("aura-2-diana-es", "https://learn.alphonsoecosystem.app/"))
    }

    @Test
    fun `prefs parse untrusted json, keep characters independent, and round-trip`() {
        val prefs = VoicePrefs.fromJson(
            Json.parseToJsonElement("""{"alphonso":{"en":"aura-2-luna-en","es":"aura-2-luna-en"},"hector":{"en":"aura-2-zeus-en","fr":"aura-2-agathe-fr"},"other":1}"""),
        )
        assertEquals("aura-2-luna-en", prefs.voice(VoiceCharacter.Alphonso, "en"))
        assertEquals("aura-2-javier-es", prefs.voice(VoiceCharacter.Alphonso, "es"))
        assertEquals("aura-2-hermes-en", prefs.voice(VoiceCharacter.Hector, "en"))
        assertEquals("aura-2-agathe-fr", prefs.voice(VoiceCharacter.Hector, "fr"))
        assertEquals(prefs, VoicePrefs.fromJson(prefs.toJson()))
        // Off-list or wrong-course ids never survive parsing, so they are never written back to the account.
        assertEquals(mapOf("fr" to "aura-2-agathe-fr"), prefs.choices[VoiceCharacter.Hector])
        assertEquals(mapOf("en" to "aura-2-luna-en"), prefs.choices[VoiceCharacter.Alphonso])
        assertEquals(VoicePrefs(), VoicePrefs.fromJson(Json.parseToJsonElement("\"x\"")))
    }

    @Test
    fun `choosing the default clears the entry and an off-list voice changes nothing`() {
        val chosen = VoicePrefs().with(VoiceCharacter.Hector, "es", "aura-2-celeste-es")
        assertEquals("aura-2-celeste-es", chosen.voice(VoiceCharacter.Hector, "es"))
        assertEquals(VoicePrefs(), chosen.with(VoiceCharacter.Hector, "es", "aura-2-alvaro-es"))
        assertEquals(chosen, chosen.with(VoiceCharacter.Hector, "es", "aura-2-valentina-es"))
    }

    @Test
    fun `store saves to the account before the cache, hydrates from the account, and clears`() = runTest {
        var cache: String? = null
        var account: VoicePrefs? = VoicePrefs().with(VoiceCharacter.Alphonso, "en", "aura-2-apollo-en")
        var failSave = false
        val store = VoicePrefsStore(
            read = { cache },
            write = { cache = it },
            fetch = { account },
            save = { if (failSave) error("offline") else account = it },
        )
        assertEquals("aura-2-saturn-en", store.voice(VoiceCharacter.Alphonso, "en"))
        store.hydrate()
        assertEquals("aura-2-apollo-en", store.voice(VoiceCharacter.Alphonso, "en"))

        store.choose(VoiceCharacter.Hector, "en", "aura-2-orpheus-en")
        assertEquals("aura-2-orpheus-en", account!!.voice(VoiceCharacter.Hector, "en"))
        assertEquals("aura-2-orpheus-en", store.voice(VoiceCharacter.Hector, "en"))
        assertEquals("aura-2-apollo-en", store.voice(VoiceCharacter.Alphonso, "en"))

        failSave = true
        assertTrue(runCatching { store.choose(VoiceCharacter.Hector, "en", "aura-2-mars-en") }.isFailure)
        assertEquals("aura-2-orpheus-en", store.voice(VoiceCharacter.Hector, "en"))

        account = null
        store.hydrate()
        assertEquals("aura-2-orpheus-en", store.voice(VoiceCharacter.Hector, "en"))
        store.clear()
        assertNull(cache)
    }
}
