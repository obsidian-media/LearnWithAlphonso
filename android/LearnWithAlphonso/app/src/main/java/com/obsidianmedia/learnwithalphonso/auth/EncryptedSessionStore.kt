package com.obsidianmedia.learnwithalphonso.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.obsidianmedia.learnwithalphonso.core.auth.SessionStore
import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseSession

/**
 * The Android counterpart of KeychainSessionStore.swift: the refresh token
 * is a long-lived credential, so it lives in EncryptedSharedPreferences
 * (AES-256 keys held by the Android Keystore), never plain preferences.
 */
class EncryptedSessionStore(context: Context) : SessionStore {
    // A file this device cannot decrypt (restored or transferred from another phone, or a Keystore reset) would throw
    // here on every launch. The session in it is unusable anyway, so the file is removed and recreated empty: the
    // learner signs in again.
    private val prefs: SharedPreferences = runCatching { open(context) }.getOrElse {
        context.deleteSharedPreferences(FILE)
        open(context)
    }

    private fun open(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(
            context,
            FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun load(): SupabaseSession? {
        val raw = prefs.getString(KEY, null) ?: return null
        return runCatching { ContentJson.json.decodeFromString(SupabaseSession.serializer(), raw) }.getOrNull()
    }

    override fun save(session: SupabaseSession) {
        prefs.edit().putString(KEY, ContentJson.json.encodeToString(SupabaseSession.serializer(), session)).apply()
    }

    override fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private companion object {
        const val FILE = "alphonso.session"
        const val KEY = "session"
    }
}
