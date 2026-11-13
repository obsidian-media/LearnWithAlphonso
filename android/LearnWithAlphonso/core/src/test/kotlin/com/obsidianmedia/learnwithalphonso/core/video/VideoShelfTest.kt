package com.obsidianmedia.learnwithalphonso.core.video

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VideoShelfTest {
    private val base = "https://example.supabase.co"

    private fun video(
        id: String = "v1", course: String = "en", title: String = "A", sort: Int = 0, duration: Int = 50,
        progress: Int = 0, completedAt: String? = null,
    ) = LibraryVideo(
        id = id, slug = "en-$id", course = course, title = title, level = "A1", durationSeconds = duration,
        videoUrl = "https://x.test/$id.mp4", captionsUrl = "https://x.test/$id.vtt",
        sortOrder = sort, progressSeconds = progress, completedAt = completedAt,
    )

    @Test fun `state, fraction and resume`() {
        assertEquals(VideoState.NEW, VideoShelf.state(video()))
        assertEquals(VideoState.IN_PROGRESS, VideoShelf.state(video(progress = 12)))
        assertEquals(VideoState.DONE, VideoShelf.state(video(progress = 12, completedAt = "2026-11-14T00:00:00Z")))
        assertEquals(1.0, VideoShelf.fraction(video(progress = 5, completedAt = "x")), 0.0001)
        assertEquals(0.5, VideoShelf.fraction(video(progress = 25)), 0.0001)
        assertEquals(1.0, VideoShelf.fraction(video(progress = 500)), 0.0001)
        assertEquals(20, VideoShelf.resumeSeconds(video(progress = 20)))
        assertEquals(0, VideoShelf.resumeSeconds(video(progress = 48)), "saved inside the last seconds: restart")
        assertEquals(0, VideoShelf.resumeSeconds(video(progress = 20, completedAt = "x")))
        assertEquals(0, VideoShelf.resumeSeconds(video()))
    }

    @Test fun `the shelf is the courses videos in order and empty when there are none`() {
        val all = listOf(video("b", title = "B", sort = 2), video("a", title = "A", sort = 1), video("f", course = "fr"))
        assertEquals(listOf("a", "b"), VideoShelf.shelf(all, "en").map { it.id })
        assertTrue(VideoShelf.shelf(all, "es").isEmpty())
    }

    @Test fun `captions are on by default and speeds cycle`() {
        assertTrue(VideoShelf.CAPTIONS_DEFAULT_ON)
        assertEquals(1.25, VideoShelf.nextSpeed(1.0), 0.0)
        assertEquals(0.75, VideoShelf.nextSpeed(1.5), 0.0)
        assertEquals(1.0, VideoShelf.nextSpeed(3.0), 0.0)
        assertEquals("1x", VideoShelf.speedLabel(1.0))
        assertEquals("1.25x", VideoShelf.speedLabel(1.25))
    }

    @Test fun `clock reads minutes and padded seconds`() {
        assertEquals("0:49", VideoShelf.clock(49.0))
        assertEquals("6:12", VideoShelf.clock(372.4))
        assertEquals("1:00", VideoShelf.clock(60.0))
        assertEquals("0:00", VideoShelf.clock(-5.0))
        assertEquals("0:00", VideoShelf.clock(Double.NaN))
    }

    @Test fun `the practice link goes to a lesson, a talk or a campaign scene zero`() {
        assertEquals(VideoPracticeTarget.Lesson("u3l2"), VideoShelf.practiceTarget(VideoPractice("lesson", "u3l2")))
        assertEquals(VideoPracticeTarget.Talk("coffee"), VideoShelf.practiceTarget(VideoPractice("talk", "coffee")))
        assertEquals(VideoPracticeTarget.Campaign("city-day", 0), VideoShelf.practiceTarget(VideoPractice("campaign", "city-day")))
        assertNull(VideoShelf.practiceTarget(null))
        assertNull(VideoShelf.practiceTarget(VideoPractice("quiz", "x")))
        assertNull(VideoShelf.practiceTarget(VideoPractice("lesson", "")))
    }

    @Test fun `public URLs point at the videos bucket segment by segment`() {
        assertEquals("$base/storage/v1/object/public/videos/en/en-a%20b.mp4", VideoShelf.publicUrl("$base/", "en/en-a b.mp4"))
        assertNull(VideoShelf.publicUrl(base, ""))
    }

    @Test fun `rows become videos with the learner's progress and unplayable rows are dropped`() {
        fun rows(text: String) = ContentJson.json.parseToJsonElement(text).jsonArray.map { it.jsonObject }
        val good = """{"id":"v1","slug":"en-a","course":"en","title":"A","level_id":"A1","duration_seconds":49,"video_path":"en/en-a.mp4","poster_path":"en/en-a.jpg","captions_path":"en/en-a.en.vtt","tags":["food"],"practice_kind":"lesson","practice_id":"u3l2","sort_order":3}"""
        val noCaptions = good.replace("\"id\":\"v1\"", "\"id\":\"v2\"").replace("\"captions_path\":\"en/en-a.en.vtt\"", "\"captions_path\":null")
        val badCourse = good.replace("\"id\":\"v1\"", "\"id\":\"v3\"").replace("\"course\":\"en\"", "\"course\":\"de\"")
        val halfPractice = good.replace("\"id\":\"v1\"", "\"id\":\"v4\"").replace("\"practice_id\":\"u3l2\"", "\"practice_id\":null")
        val watches = rows("""[{"video_id":"v1","progress_seconds":20,"completed_at":null}]""")

        val videos = VideoShelf.videos(rows("[$good,$noCaptions,$badCourse,$halfPractice]"), watches, base)
        assertEquals(listOf("v1", "v4"), videos.map { it.id })
        assertEquals(20, videos[0].progressSeconds)
        assertEquals(49, videos[0].durationSeconds)
        assertEquals(VideoPractice("lesson", "u3l2"), videos[0].practice)
        assertEquals("$base/storage/v1/object/public/videos/en/en-a.en.vtt", videos[0].captionsUrl)
        assertTrue(videos[0].posterUrl!!.endsWith("en-a.jpg"))
        assertNull(videos[1].practice, "a half-set practice target is no target")
        assertEquals(0, videos[1].progressSeconds)
    }
}
