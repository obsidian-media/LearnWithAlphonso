package com.obsidianmedia.learnwithalphonso.push

import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.obsidianmedia.learnwithalphonso.AlphonsoApplication
import com.obsidianmedia.learnwithalphonso.core.logic.PushTap
import com.obsidianmedia.learnwithalphonso.notifications.NotificationChannels
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** The FCM token, or null when Firebase is not configured in this build (no google-services.json). */
suspend fun firebaseToken(): String? = runCatching {
    suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { if (cont.isActive) cont.resume(it) }
            .addOnFailureListener { if (cont.isActive) cont.resume(null) }
    }
}.getOrNull()

class AlphonsoMessagingService : FirebaseMessagingService() {
    private val container get() = (application as AlphonsoApplication).container

    override fun onNewToken(token: String) {
        container.pushRegistrar.onNewToken(token)
    }

    /** Nudges, overtakes and support replies from send-push; the server sends both a notification block and a data type. */
    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"] ?: ""
        val type = message.data[PushTap.EXTRA_TYPE]
        val id = when (type) { "nudge" -> 201; "overtake" -> 202; "support" -> 203; else -> 200 }
        NotificationChannels.post(this, NotificationChannels.SOCIAL, id, title, body, type)
    }
}
