package com.obsidianmedia.learnwithalphonso.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred

/**
 * Asks for RECORD_AUDIO on first use, never at launch (spec section 8). The
 * launcher must be registered before the activity starts, so MainActivity
 * owns one and hands it here.
 */
class MicPermission(private val context: Context) {
    private var launcher: ActivityResultLauncher<String>? = null
    private var pending: CompletableDeferred<Boolean>? = null

    fun register(activity: ComponentActivity) {
        launcher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            pending?.complete(granted)
            pending = null
        }
    }

    fun isGranted(): Boolean = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    /** Resolves immediately when already granted; otherwise shows the system dialog once. */
    suspend fun request(): Boolean {
        if (isGranted()) return true
        val l = launcher ?: return false
        pending?.let { return it.await() }
        val deferred = CompletableDeferred<Boolean>()
        pending = deferred
        l.launch(Manifest.permission.RECORD_AUDIO)
        return deferred.await()
    }
}
