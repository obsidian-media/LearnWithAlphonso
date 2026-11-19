package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HandsFreePreferenceTest {
    private class MapStore : HandsFreeStore {
        val values = HashMap<String, Boolean>()
        override fun getBoolean(key: String, default: Boolean) = values[key] ?: default
        override fun putBoolean(key: String, value: Boolean) { values[key] = value }
    }

    @Test
    fun `starts off until the learner turns it on`() {
        val pref = HandsFreePreference(MapStore())
        assertFalse(pref.isPreferred)
        assertFalse(pref.shouldStartOn)
    }

    @Test
    fun `remembers on and off across instances`() {
        val store = MapStore()
        HandsFreePreference(store).remember(true)
        assertTrue(HandsFreePreference(store).isPreferred)
        HandsFreePreference(store).remember(false)
        assertFalse(HandsFreePreference(store).isPreferred)
    }

    @Test
    fun `never starts on before the safety note was confirmed`() {
        val store = MapStore()
        HandsFreePreference(store).remember(true)
        assertFalse(HandsFreePreference(store).shouldStartOn)
        store.putBoolean(HandsFreeCopy.NOTE_SEEN_KEY, true)
        assertTrue(HandsFreePreference(store).shouldStartOn)
    }
}
