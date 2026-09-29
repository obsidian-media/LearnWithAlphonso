package com.obsidianmedia.learnwithalphonso

import android.content.Context
import androidx.room.Room
import com.obsidianmedia.learnwithalphonso.auth.EncryptedSessionStore
import com.obsidianmedia.learnwithalphonso.core.auth.SessionManager
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.net.AccountClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import com.obsidianmedia.learnwithalphonso.core.net.TranslationGradingClient
import com.obsidianmedia.learnwithalphonso.data.AlphonsoDatabase
import com.obsidianmedia.learnwithalphonso.data.RoomSyncQueueStore
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import com.obsidianmedia.learnwithalphonso.net.ConnectivityMonitor
import com.obsidianmedia.learnwithalphonso.sync.SyncCoordinator
import com.obsidianmedia.learnwithalphonso.ui.theme.ThemeManager
import io.ktor.client.engine.okhttp.OkHttp

/** Manual wiring for the whole app; one instance owned by AlphonsoApplication. */
class AppContainer(context: Context) {
    private val app = context.applicationContext
    private val engine = OkHttp.create()

    val content: ContentStore = ContentStore { name -> app.assets.open(name).bufferedReader().use { it.readText() } }
    val themeManager = ThemeManager(app.getSharedPreferences("alphonso.prefs", Context.MODE_PRIVATE))
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

    private val apiHttp = ApiHttp(BuildConfig.API_BASE_URL, { session.freshAccessToken() }, engine) { session.freshAccessToken(force = true) }
    val accountClient = AccountClient(apiHttp)
    val translationGrading = TranslationGradingClient(apiHttp)

    private val database = Room.databaseBuilder(app, AlphonsoDatabase::class.java, "alphonso.db").build()
    val syncStore: SyncQueueStore = RoomSyncQueueStore(database.syncDao())

    val syncCoordinator = SyncCoordinator(syncStore) { if (session.currentAccessToken() != null) progressClient else null }
}
