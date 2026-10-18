package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.core.auth.SessionManager
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import io.ktor.client.engine.HttpClientEngine

/**
 * The client a sync pass uses: one per pass, bound to the account that started it. Its token reads and refreshes are
 * [SessionManager.freshAccessTokenFor], never the plain `freshAccessToken`, so once another account is signed in a request
 * is not sent (see `AccountChangedException`). The caller closes it when the pass ends ([ProgressSyncClient.close]).
 */
object PassClients {
    fun factory(session: SessionManager, baseUrl: String, anonKey: String, engine: HttpClientEngine): (userId: String) -> ProgressSyncClient? = { userId ->
        if (session.currentAccessToken() == null) null
        else ProgressSyncClient(
            SupabaseHttp(
                baseUrl = baseUrl,
                anonKey = anonKey,
                accessToken = { session.freshAccessTokenFor(userId) },
                engine = engine,
                refresh = { session.freshAccessTokenFor(userId, force = true) },
            ),
        )
    }
}
