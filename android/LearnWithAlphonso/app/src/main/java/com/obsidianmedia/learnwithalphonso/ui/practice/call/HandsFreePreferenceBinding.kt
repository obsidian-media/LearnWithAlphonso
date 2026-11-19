package com.obsidianmedia.learnwithalphonso.ui.practice.call

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import com.obsidianmedia.learnwithalphonso.AlphonsoApplication
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreePreference

/** SharedPreferences as the hands-free preference's store. */
internal class SharedPrefsHandsFreeStore(private val prefs: android.content.SharedPreferences) : com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeStore {
    override fun getBoolean(key: String, default: Boolean) = prefs.getBoolean(key, default)
    override fun putBoolean(key: String, value: Boolean) { prefs.edit().putBoolean(key, value).apply() }
}

/**
 * A new call starts with hands-free on when the learner last left it on and has already confirmed the safety note. It is
 * skipped when the call is already hands-free (a campaign carrying it to the next scene), when the campaign is over,
 * and when the microphone permission is not granted: that falls back to hold-to-talk, which asks on the first press,
 * instead of a prompt appearing under the opening line. Pause and the limits are the loop's, unchanged.
 */
@Composable
internal fun ApplyStoredHandsFree(vm: CallConversation) {
    val context = LocalContext.current
    LaunchedEffect(Unit) {
        val prefs = (context.applicationContext as? AlphonsoApplication)?.container?.prefs ?: return@LaunchedEffect
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
        if (HandsFreeBinding.shouldAutoStart(HandsFreePreference(SharedPrefsHandsFreeStore(prefs)).shouldStartOn, granted, vm.handsFree.isOn, vm.isCallOver)) {
            vm.handsFree.enable()
        }
    }
}
