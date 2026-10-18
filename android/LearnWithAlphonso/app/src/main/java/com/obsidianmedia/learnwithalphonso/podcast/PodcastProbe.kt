package com.obsidianmedia.learnwithalphonso.podcast

import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastProbeResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException

/**
 * A HEAD request against an episode URL, run only after a remote item failed to play. The player reports "could not
 * load" the same way for a missing object and a dead network; the status (or the lack of any answer) tells them apart.
 */
class PodcastProbe(private val http: OkHttpClient) {
    suspend operator fun invoke(url: String): PodcastProbeResult = withContext(Dispatchers.IO) {
        try {
            http.newCall(Request.Builder().url(url).head().build()).execute().use { PodcastProbeResult.Status(it.code) }
        } catch (e: IOException) {
            PodcastProbeResult.NoResponse
        } catch (e: IllegalArgumentException) {
            PodcastProbeResult.NotRun
        }
    }
}
