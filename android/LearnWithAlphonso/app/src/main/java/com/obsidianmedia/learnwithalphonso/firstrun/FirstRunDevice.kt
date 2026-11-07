package com.obsidianmedia.learnwithalphonso.firstrun

import android.content.Context
import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRun
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRunKeyValue
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRunStore
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech

/**
 * The first run's storage on this device (core FirstRunStore): the answers until sign-in, and the under-13 block.
 * Both are private app preferences written with commit(), so the block is on disk before anything else runs, and it
 * is read synchronously at start-up, before crash reporting or RevenueCat would start (a DataStore read there would
 * have to block the main thread anyway). allowBackup is off, so the block never travels to another device.
 */
object FirstRunDevice {
    @Volatile private var current: FirstRunStore? = null

    /** First thing in AlphonsoApplication.onCreate. */
    fun init(context: Context) {
        if (current != null) return
        val app = context.applicationContext
        current = FirstRunStore(
            PrefsKeyValue(app.getSharedPreferences("alphonso.firstrun.answers", Context.MODE_PRIVATE)),
            PrefsKeyValue(app.getSharedPreferences("alphonso.firstrun.device", Context.MODE_PRIVATE)),
        )
    }

    val store: FirstRunStore get() = checkNotNull(current) { "FirstRunDevice.init was not called" }

    /**
     * True once this device answered Under 13. Read by everything that would send: crash reporting, RevenueCat, the
     * update check, the session restore, sign-out's server call and speech.
     */
    val isBlocked: Boolean get() = current?.isBlocked() == true

    /** Alphonso reads a step's line on tap: on-device speech, no account. A blocked device never speaks again. */
    fun speak(context: Context, text: String, course: Course = Course.ENGLISH) {
        if (isBlocked) return
        Speech.get(context).speak(FirstRun.spoken(text), course)
    }
}

private class PrefsKeyValue(private val prefs: SharedPreferences) : FirstRunKeyValue {
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun set(key: String, value: String?) {
        // commit, not apply: the block must be on disk before the next line runs.
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.commit()
    }
}
