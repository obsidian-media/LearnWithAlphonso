package com.obsidianmedia.learnwithalphonso.data

import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralCodeStore

/** The device's copy of a captured referral code: one opaque code and the moment it was captured, nothing else. */
class ReferralPrefsStore(private val prefs: SharedPreferences) : ReferralCodeStore {
    override fun load(): ReferralCodeStore.Kept? {
        val raw = prefs.getString(KEY, null) ?: return null
        val at = raw.substringAfter('|', "").toLongOrNull() ?: return null
        val code = raw.substringBefore('|')
        return ReferralCodeStore.Kept(code, at)
    }

    override fun save(code: String, atMillis: Long) {
        prefs.edit().putString(KEY, "$code|$atMillis").apply()
    }

    override fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private companion object {
        const val KEY = "referral.pending.v1"
    }
}
