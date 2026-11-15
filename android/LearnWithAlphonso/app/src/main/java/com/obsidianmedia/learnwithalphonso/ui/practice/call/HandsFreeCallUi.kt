package com.obsidianmedia.learnwithalphonso.ui.practice.call

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.obsidianmedia.learnwithalphonso.AlphonsoApplication
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeCopy
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeInterruption
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop
import com.obsidianmedia.learnwithalphonso.ui.components.DsSwitch
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

private fun HandsFreeLoop.Status.isPaused() = this is HandsFreeLoop.Status.Paused

/**
 * The "Hands-free" switch of a voice call, with its once-per-device safety note (iOS `HandsFreeSwitch`). It lives in the
 * call's conversation sheet, above the transcript. Turning it on is free: it is the same turn as a held press, so the
 * server's daily caps already apply, and on Hector the call itself is Pro. It starts off with every call.
 */
@Composable
internal fun HandsFreeSwitch(vm: CallConversation, partner: String) {
    val ds = LocalAlphonsoTokens.current
    val status by vm.handsFree.status.collectAsState()
    val on = status != HandsFreeLoop.Status.Off
    val context = LocalContext.current
    val prefs = remember { (context.applicationContext as? AlphonsoApplication)?.container?.prefs }
    var showNote by remember { mutableStateOf(false) }
    val change: (Boolean) -> Unit = { wantsOn ->
        if (!wantsOn) vm.handsFree.disable()
        else if (prefs?.getBoolean(HandsFreeCopy.NOTE_SEEN_KEY, false) == true) vm.handsFree.enable()
        else showNote = true
    }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 4.dp)
            .toggleable(value = on, role = Role.Switch, onValueChange = change),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(HandsFreeCopy.TOGGLE, style = FootnoteType, color = ds.ink, modifier = Modifier.weight(1f))
        DsSwitch(checked = on, onChange = null)
    }
    if (showNote) {
        AlertDialog(
            onDismissRequest = { showNote = false },
            containerColor = ds.surface,
            title = { Text(HandsFreeCopy.FIRST_USE_TITLE, color = ds.ink) },
            text = { Text(HandsFreeCopy.firstUseBody(partner), color = ds.inkSoft) },
            confirmButton = {
                TextButton(onClick = {
                    prefs?.edit()?.putBoolean(HandsFreeCopy.NOTE_SEEN_KEY, true)?.apply()
                    showNote = false
                    vm.handsFree.enable()
                }) { Text(HandsFreeCopy.FIRST_USE_CONFIRM, color = ds.choice) }
            },
            dismissButton = { TextButton(onClick = { showNote = false }) { Text(HandsFreeCopy.CANCEL, color = ds.choice) } },
        )
    }
}

/**
 * What hands-free says on the call while it is on: listening, hearing, waiting for the partner, or why it paused. A
 * pause is a safety stop, so it gets the stronger glass and a pause mark and is announced at once; the others are
 * polite. Drawn in the call's glass like the state pill above it.
 */
@Composable
internal fun HandsFreeStatusPill(status: HandsFreeLoop.Status, partner: String) {
    val line = HandsFreeCopy.statusLine(status, partner) ?: return
    val paused = status.isPaused()
    // One polite live region carries the call's state (the label under the caption); this pill announces only a pause,
    // and the line that follows a resume, never every Listening and Hearing change.
    val view = androidx.compose.ui.platform.LocalView.current
    var wasPaused by remember { mutableStateOf(false) }
    LaunchedEffect(paused) {
        if (paused || wasPaused) view.announceForAccessibility(line)
        wasPaused = paused
    }
    Row(
        Modifier.padding(top = 8.dp).clip(CircleShape).background(if (paused) callGlassStrong() else callGlass())
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .clearAndSetSemantics { contentDescription = line },
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        if (paused) Icon(Icons.Filled.Pause, null, tint = callInk(), modifier = Modifier.size(14.dp))
        Text(line, color = callInk(), style = FootnoteType, textAlign = TextAlign.Center)
    }
}

/** Hands-free has no button to hold: one Pause or Resume button takes its place, the same size and place as the mic. */
@Composable
internal fun HandsFreePauseButton(status: HandsFreeLoop.Status, onToggle: () -> Unit) {
    val paused = status.isPaused()
    val label = if (paused) HandsFreeCopy.RESUME else HandsFreeCopy.PAUSE
    Box(
        Modifier.size(78.dp).clip(CircleShape).background(callInk())
            .semantics { contentDescription = label; role = Role.Button }
            .clickable(onClick = onToggle),
        contentAlignment = Alignment.Center,
    ) {
        Icon(if (paused) Icons.Filled.PlayArrow else Icons.Filled.Pause, null, tint = LocalAlphonsoTokens.current.callDock, modifier = Modifier.size(34.dp))
    }
}

/**
 * Everything hands-free needs from the platform while a call is up, and nothing when it is off: the screen stays awake
 * (hands-free is screen-on only; there is no foreground service and no locked-screen use), it stops when the screen
 * goes to the background, and it pauses when the audio is taken (another app, an incoming call) or the earbuds come out.
 */
@Composable
internal fun HandsFreeCallEffects(vm: CallConversation) {
    val status by vm.handsFree.status.collectAsState()
    val on = status != HandsFreeLoop.Status.Off
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current

    // Screen-on only: the screen is kept awake while hands-free is on, and only then.
    DisposableEffect(on) {
        val window = context.findActivity()?.window
        if (on) window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { if (on) window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    // The app leaves the foreground (home, recents, screen off): hands-free ends, so the mic never stays open behind it.
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) vm.handsFree.disable() }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }

    DisposableEffect(on) {
        if (!on) return@DisposableEffect onDispose {}
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val interrupted = { HandsFreeBinding.interrupted(vm.handsFree, vm.engine) }
        // Another app or an incoming call takes the audio focus: pause.
        val request = audio?.let {
            AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setOnAudioFocusChangeListener { change -> if (HandsFreeInterruption.pauses(change)) interrupted() }
                .build()
                .also { r -> it.requestAudioFocus(r) }
        }
        // Earbuds pulled out or a Bluetooth headset gone: pause (the mic would otherwise move to the phone's).
        val noisy = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) { interrupted() }
        }
        androidx.core.content.ContextCompat.registerReceiver(context, noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED)
        onDispose {
            runCatching { context.unregisterReceiver(noisy) }
            if (audio != null && request != null) audio.abandonAudioFocusRequest(request)
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
