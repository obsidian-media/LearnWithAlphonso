package com.obsidianmedia.learnwithalphonso.core.podcast

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull
import java.net.URLEncoder
import java.text.Normalizer

/**
 * Pre-recorded story narration (mirrors src/lib/story-recordings.ts and StoryRecordings.swift). A story's sentences are
 * recorded once, by scripts/story-audio.ts, into the public podcast-audio bucket under stories/<storyId>/, with a
 * manifest.json that lists each recorded sentence by its text. A reader looks a sentence up BY TEXT, so an edited sentence
 * has no entry (it falls back to live /api/tts speech) and nothing is hashed on the device. With every sentence recorded,
 * narration is a plain file download: no AI call, no AI quota, no AI consent.
 */
class StoryRecordings(private val files: Map<String, String>) {
    /** The object path of the recording for a sentence, or null. */
    fun pathFor(text: String): String? = files[normalize(text)]

    /** True when every sentence has a recording (and there is at least one). */
    fun allRecorded(segments: List<String>): Boolean = segments.isNotEmpty() && segments.all { pathFor(it) != null }

    val size: Int get() = files.size

    companion object {
        const val BUCKET = "podcast-audio"

        /** NFC, whitespace collapsed, trimmed: the same rule as the web and the generator. */
        fun normalize(text: String): String =
            Normalizer.normalize(text, Normalizer.Form.NFC).split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")

        fun manifestPath(storyId: String) = "stories/$storyId/manifest.json"

        /** The public URL of an object in the bucket. */
        fun publicUrl(supabaseUrl: String, path: String): String {
            val encoded = path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
            return "${supabaseUrl.trimEnd('/')}/storage/v1/object/public/$BUCKET/$encoded"
        }

        /** Reads a v1 manifest. Anything else (another version, junk, files outside stories/) is null or skipped. */
        fun parse(text: String): StoryRecordings? = try {
            val root = ContentJson.json.parseToJsonElement(text).jsonObject
            if (root["v"]?.jsonPrimitive?.intOrNull != 1) {
                null
            } else {
                val files = HashMap<String, String>()
                for (entry in root["entries"]!!.jsonArray) {
                    val o = entry.jsonObject
                    val sentence = o["text"]?.jsonPrimitive?.content ?: continue
                    val file = o["file"]?.jsonPrimitive?.content ?: continue
                    if (file.startsWith("stories/") && !file.contains("..")) files[normalize(sentence)] = file
                }
                StoryRecordings(files)
            }
        } catch (e: Exception) {
            null
        }

        /**
         * Narration may start when every sentence is recorded (nothing to authorise or pay for), or else when AI speech is
         * on, which the live fallback needs. A recorded story therefore plays with AI speech off.
         */
        fun canNarrate(segments: List<String>, recordings: StoryRecordings?, aiConsentGranted: Boolean): Boolean =
            recordings?.allRecorded(segments) == true || aiConsentGranted
    }
}
