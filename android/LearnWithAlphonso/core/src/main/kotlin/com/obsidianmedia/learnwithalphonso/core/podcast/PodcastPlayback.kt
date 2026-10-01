package com.obsidianmedia.learnwithalphonso.core.podcast

import java.net.URLEncoder

/** Port of clampPosition in src/lib/podcast.functions.ts and PodcastPlayback.swift's URL builder. */
object PodcastPlayback {
    private const val BUCKET = "podcast-audio"

    /** 0 when non-finite, non-positive, or at or beyond duration - 1 (a resume inside the final second looks broken). */
    fun clampPosition(position: Double, durationSeconds: Double): Double {
        if (!position.isFinite() || position <= 0) return 0.0
        if (position >= durationSeconds - 1) return 0.0
        return position
    }

    /** The public URL for an object in the podcast-audio bucket; null for an empty path. */
    fun audioUrl(supabaseUrl: String, audioPath: String): String? {
        val segments = audioPath.split("/").filter { it.isNotEmpty() }
        if (segments.isEmpty()) return null
        val encoded = segments.joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
        return "${supabaseUrl.trimEnd('/')}/storage/v1/object/public/$BUCKET/$encoded"
    }
}
