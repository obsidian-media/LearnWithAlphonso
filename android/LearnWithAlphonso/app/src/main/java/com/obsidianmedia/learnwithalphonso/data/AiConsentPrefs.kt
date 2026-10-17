package com.obsidianmedia.learnwithalphonso.data

import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.auth.SessionManager
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentBackend
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCache
import com.obsidianmedia.learnwithalphonso.core.logic.CachedAiConsent
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.fetchAiConsent
import com.obsidianmedia.learnwithalphonso.core.net.setAiConsent

/** The consent RPCs, called as the signed-in session. */
class SessionAiConsentBackend(private val session: SessionManager, private val client: ProgressSyncClient) : AiConsentBackend {
    override fun currentUserId(): String? = session.userId
    override suspend fun fetch(): String? = client.fetchAiConsent()
    override suspend fun set(granted: Boolean): String? = client.setAiConsent(granted)
}

/** Per-account cache of the last answer, used only while the server cannot be reached ("none" = denied). */
class AiConsentPrefsCache(private val prefs: SharedPreferences) : AiConsentCache {
    override fun read(userId: String): CachedAiConsent? {
        val raw = prefs.getString(PREFIX + userId, null) ?: return null
        return CachedAiConsent(if (raw == DENIED) null else raw)
    }

    override fun write(userId: String, grantedAt: String?) {
        prefs.edit().putString(PREFIX + userId, grantedAt ?: DENIED).apply()
    }

    private companion object {
        const val PREFIX = "aiConsent.grantedAt."
        const val DENIED = "none"
    }
}
