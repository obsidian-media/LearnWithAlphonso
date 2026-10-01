package com.obsidianmedia.learnwithalphonso

import android.content.Context
import androidx.room.Room
import com.obsidianmedia.learnwithalphonso.audio.AudioPlayback
import com.obsidianmedia.learnwithalphonso.audio.MicPermission
import com.obsidianmedia.learnwithalphonso.audio.RecordingState
import com.obsidianmedia.learnwithalphonso.audio.TurnRecorder
import com.obsidianmedia.learnwithalphonso.auth.EncryptedSessionStore
import com.obsidianmedia.learnwithalphonso.billing.EntitlementStore
import com.obsidianmedia.learnwithalphonso.billing.RevenueCatBilling
import com.obsidianmedia.learnwithalphonso.core.auth.SessionManager
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.net.AccountClient
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import com.obsidianmedia.learnwithalphonso.core.net.TranslationGradingClient
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationClient
import com.obsidianmedia.learnwithalphonso.data.AlphonsoDatabase
import com.obsidianmedia.learnwithalphonso.data.LeaderboardSnapshotCache
import com.obsidianmedia.learnwithalphonso.data.LeagueTierCache
import com.obsidianmedia.learnwithalphonso.data.NudgeCooldownCache
import com.obsidianmedia.learnwithalphonso.data.RoomSyncQueueStore
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import com.obsidianmedia.learnwithalphonso.data.WeeklyRecapCache
import com.obsidianmedia.learnwithalphonso.net.ConnectivityMonitor
import com.obsidianmedia.learnwithalphonso.notifications.NotificationPermission
import com.obsidianmedia.learnwithalphonso.notifications.ReminderHooks
import com.obsidianmedia.learnwithalphonso.notifications.WorkManagerReminderScheduler
import com.obsidianmedia.learnwithalphonso.podcast.MediaControllerPort
import com.obsidianmedia.learnwithalphonso.podcast.PodcastDownloadManager
import com.obsidianmedia.learnwithalphonso.podcast.PodcastPlayer
import com.obsidianmedia.learnwithalphonso.push.PushRegistrar
import com.obsidianmedia.learnwithalphonso.push.firebaseToken
import com.obsidianmedia.learnwithalphonso.sync.SyncCoordinator
import com.obsidianmedia.learnwithalphonso.ui.theme.ThemeManager
import com.obsidianmedia.learnwithalphonso.widget.WidgetPublisher
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient

/** Manual wiring for the whole app; one instance owned by AlphonsoApplication. */
class AppContainer(context: Context) {
    private val app = context.applicationContext
    private val okHttp = OkHttpClient()
    private val engine = OkHttp.create { preconfigured = okHttp }
    /** App-lifetime work that outlives any screen: podcast saves, push registration. */
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val content: ContentStore = ContentStore { name -> app.assets.open(name).bufferedReader().use { it.readText() } }
    val prefs: android.content.SharedPreferences = app.getSharedPreferences("alphonso.prefs", Context.MODE_PRIVATE)
    val themeManager = ThemeManager(prefs)
    val snapshotCache = LeaderboardSnapshotCache(prefs)
    val recapCache = WeeklyRecapCache(prefs)
    val nudgeCache = NudgeCooldownCache(prefs)
    val tierCache = LeagueTierCache(prefs)
    val connectivity = ConnectivityMonitor(app)

    val session = SessionManager(
        SupabaseAuthClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY, engine),
        EncryptedSessionStore(app),
    )

    /** Every Supabase call shares the session's token and its one-retry-on-401 refresh. */
    val supabaseHttp = SupabaseHttp(
        baseUrl = BuildConfig.SUPABASE_URL,
        anonKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY,
        accessToken = { session.freshAccessToken() },
        engine = engine,
        refresh = { session.freshAccessToken(force = true) },
    )
    val progressClient = ProgressSyncClient(supabaseHttp)
    val podcastClient = PodcastClient(supabaseHttp, { session.userId })

    private val apiHttp = ApiHttp(BuildConfig.API_BASE_URL, { session.freshAccessToken() }, engine) { session.freshAccessToken(force = true) }
    val accountClient = AccountClient(apiHttp)
    val translationGrading = TranslationGradingClient(apiHttp)
    val aiClient = AiConversationClient(apiHttp)
    val tutorClient = TutorConversationClient(apiHttp, deviceId())
    val micPermission = MicPermission(app)
    val notificationPermission = NotificationPermission(app, prefs)
    fun newRecorder() = TurnRecorder(app)
    fun newPlayback() = AudioPlayback(app)
    val entitlements = EntitlementStore(RevenueCatBilling.createIfConfigured(app, BuildConfig.REVENUECAT_PUBLIC_KEY))

    /** A stable per-install id for the tutor service's rate limiting; never a hardware identifier. */
    private fun deviceId(): String {
        val key = "installId"
        return prefs.getString(key, null) ?: java.util.UUID.randomUUID().toString().also { prefs.edit().putString(key, it).apply() }
    }

    private val database = Room.databaseBuilder(app, AlphonsoDatabase::class.java, "alphonso.db")
        .addMigrations(AlphonsoDatabase.MIGRATION_1_2)
        .build()
    val syncStore: SyncQueueStore = RoomSyncQueueStore(database.syncDao(), onProgressUpdated = { WidgetPublisher.publish(app, it) })

    val syncCoordinator = SyncCoordinator(syncStore) { if (session.currentAccessToken() != null) progressClient else null }

    // ---- Plan 4: podcasts, reminders, push ----

    val downloads = PodcastDownloadManager(app, database.podcastDownloadDao(), okHttp).also { d -> appScope.launch { d.reconcile() } }
    val podcastPlayer = PodcastPlayer(
        MediaControllerPort(app, appScope),
        { if (session.currentAccessToken() != null) podcastClient else null },
        RecordingState.isRecording,
        appScope,
    )
    val reminders = ReminderHooks(WorkManagerReminderScheduler(app))
    val pushRegistrar = PushRegistrar(
        tokenSource = { firebaseToken() },
        permissionGranted = { notificationPermission.isGranted() },
        isSignedIn = { session.currentAccessToken() != null },
        client = { if (session.currentAccessToken() != null) progressClient else null },
        prefs = prefs,
        scope = appScope,
    )
}
