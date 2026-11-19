package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.podcast.StoryRecordings
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.request.get
import io.ktor.client.statement.readRawBytes
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException

/**
 * Downloads a story's pre-recorded narration from the public podcast-audio bucket: the manifest, then each sentence's MP3.
 * Public files, so no auth header and no AI call. Every failure (no file yet, offline) is null, never a throw, because the
 * caller falls back to live speech.
 */
class StoryRecordingsClient(private val supabaseUrl: String, engine: HttpClientEngine) {
    private val client = HttpClient(engine) { expectSuccess = false }

    suspend fun load(storyId: String): StoryRecordings? =
        get(StoryRecordings.publicUrl(supabaseUrl, StoryRecordings.manifestPath(storyId)))?.decodeToString()?.let { StoryRecordings.parse(it) }

    suspend fun audio(path: String): ByteArray? = get(StoryRecordings.publicUrl(supabaseUrl, path))

    private suspend fun get(url: String): ByteArray? = try {
        val response = client.get(url)
        if (response.status == HttpStatusCode.OK) response.readRawBytes().takeIf { it.isNotEmpty() } else null
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
}
