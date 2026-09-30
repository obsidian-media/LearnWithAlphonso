package com.obsidianmedia.learnwithalphonso.notifications

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred

/**
 * POST_NOTIFICATIONS (API 33+), asked at the first lesson completion and
 * only while undetermined, so a prior decline is never re-prompted (the
 * LessonPlayerView.swift priming moment). Android does not expose "never
 * asked" directly, so a preference records that the prompt was shown once.
 */
class NotificationPermission(private val context: Context, private val prefs: SharedPreferences) {
    private var launcher: ActivityResultLauncher<String>? = null
    private var pending: CompletableDeferred<Boolean>? = null

    fun register(activity: ComponentActivity) {
        launcher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            pending?.complete(granted)
            pending = null
        }
    }

    fun isGranted(): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun isUndetermined(): Boolean = !isGranted() && !prefs.getBoolean(ASKED_KEY, false)

    /** Shows the system dialog once; returns the resulting grant state. */
    suspend fun requestIfUndetermined(): Boolean {
        if (isGranted()) return true
        if (!isUndetermined()) return false
        val l = launcher ?: return false
        prefs.edit().putBoolean(ASKED_KEY, true).apply()
        pending?.let { return it.await() }
        val deferred = CompletableDeferred<Boolean>()
        pending = deferred
        l.launch(Manifest.permission.POST_NOTIFICATIONS)
        return deferred.await()
    }

    companion object {
        const val ASKED_KEY = "notificationsAsked"
    }
}
