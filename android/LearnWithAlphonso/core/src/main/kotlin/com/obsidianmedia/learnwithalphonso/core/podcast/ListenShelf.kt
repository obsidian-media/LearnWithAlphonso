package com.obsidianmedia.learnwithalphonso.core.podcast

/** One row of `listen_progress`, as the client reads it. [updatedAt] is ISO-8601, so same-format strings sort in time order. */
data class ListenProgress(
    val episodeId: String,
    val positionS: Int,
    val completedAt: String?,
    val updatedAt: String,
)

enum class ListenEpisodeState { New, InProgress, Done }

/** A folder that directly holds episodes, with what the Listen shelf draws for it. [percent] is exactly 100 only when every episode is done. */
data class ListenShelfFolder(
    val folder: PodcastFolder,
    val level: String?,
    val room: String,
    val episodes: List<PodcastEpisode>,
    val doneCount: Int,
    val percent: Int,
    val totalSeconds: Int,
)

data class ListenContinueTarget(val shelf: ListenShelfFolder, val episode: PodcastEpisode, val progress: ListenProgress?)

/** Pure logic behind the Listen shelf. Mirrors src/lib/listen-library.ts (web) and ListenShelf.swift (iOS). */
object ListenShelf {
    val ROOMS = listOf("library", "kitchen", "market", "seaside", "station", "garden", "classroom", "bank", "coffee", "radio")

    fun state(p: ListenProgress?): ListenEpisodeState = when {
        p == null -> ListenEpisodeState.New
        p.completedAt != null -> ListenEpisodeState.Done
        p.positionS > 0 -> ListenEpisodeState.InProgress
        else -> ListenEpisodeState.New
    }

    /** 0..1 heard; a finished episode is 1 whatever its last position says. */
    fun fraction(e: PodcastEpisode, p: ListenProgress?): Double = when {
        p == null -> 0.0
        p.completedAt != null -> 1.0
        e.durationSeconds <= 0 -> 0.0
        else -> (p.positionS.toDouble() / e.durationSeconds).coerceIn(0.0, 1.0)
    }

    fun secondsLeft(e: PodcastEpisode, p: ListenProgress?): Int =
        if (p == null || p.completedAt != null) e.durationSeconds else (e.durationSeconds - p.positionS).coerceAtLeast(0)

    /** 370 -> "6:10". */
    fun clock(seconds: Int): String {
        val s = seconds.coerceAtLeast(0)
        return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
    }

    /** 12000 -> "3 h 20 m"; 2400 -> "40 m". */
    fun hoursMinutes(seconds: Int): String {
        val m = seconds.coerceAtLeast(0) / 60
        return if (m >= 60) "${m / 60} h ${m % 60} m" else "$m m"
    }

    /** The start of the current UTC month, ISO-8601 with a Z: where "this month" begins (web counts the same way). */
    fun monthStartIso(nowMillis: Long): String {
        val date = java.time.Instant.ofEpochMilli(nowMillis).atZone(java.time.ZoneOffset.UTC).toLocalDate()
        return "%04d-%02d-01T00:00:00Z".format(date.year, date.monthValue)
    }

    /** Seconds listened this month from `podcast_play_events` rows; garbage rows count for nothing. */
    fun monthSeconds(rows: List<Int>): Int = rows.sumOf { it.coerceAtLeast(0) }

    /** The month chip's text, or null under one minute (hidden, as on web). */
    fun monthChip(seconds: Int): String? = if (seconds >= 60) "${hoursMinutes(seconds)} this month" else null

    /** Capped below int4 so "the very end" reaches the database's own clamp instead of overflowing it. */
    fun wirePosition(seconds: Int): Int = seconds.coerceIn(0, 2_000_000_000)

    private val LEVEL = Regex("^[abc][12]$", RegexOption.IGNORE_CASE)

    /** The CEFR level named by any segment of the folder's path (slug or title), or null. */
    fun level(folderId: String, folders: List<PodcastFolder>): String? {
        val byId = folders.associateBy { it.id }
        var cur = byId[folderId]
        var depth = 0
        while (cur != null && depth < 64) {
            listOf(cur.slug, cur.title.trim()).firstOrNull { LEVEL.matches(it) }?.let { return it.uppercase() }
            cur = cur.parentId?.let { byId[it] }
            depth++
        }
        return null
    }

    private val KEYWORDS = listOf(
        Regex("book|librar|read|stor", RegexOption.IGNORE_CASE) to "library",
        Regex("kitchen|cook|food|recipe", RegexOption.IGNORE_CASE) to "kitchen",
        Regex("market|shop|buy", RegexOption.IGNORE_CASE) to "market",
        Regex("sea|beach|travel|holiday", RegexOption.IGNORE_CASE) to "seaside",
        Regex("station|train|transport", RegexOption.IGNORE_CASE) to "station",
        Regex("garden|nature|farm", RegexOption.IGNORE_CASE) to "garden",
        Regex("class|school|study", RegexOption.IGNORE_CASE) to "classroom",
        Regex("bank|money|post", RegexOption.IGNORE_CASE) to "bank",
        Regex("cafe|café|coffee|chat", RegexOption.IGNORE_CASE) to "coffee",
    )

    /** A folder's room: by subject when the name says, otherwise a stable pick from its slug. */
    fun room(folder: PodcastFolder): String {
        for ((re, room) in KEYWORDS) if (re.containsMatchIn(folder.slug) || re.containsMatchIn(folder.title)) return room
        var h = 0L
        for (ch in folder.slug) h = (h * 31 + ch.code) and 0xFFFFFFFFL
        return ROOMS[(h % ROOMS.size).toInt()]
    }

    /** The course of the folder's root, or null when the root has none. */
    fun course(folderId: String, folders: List<PodcastFolder>): String? {
        val byId = folders.associateBy { it.id }
        var cur = byId[folderId]
        var depth = 0
        while (cur != null && depth < 64) {
            if (cur.parentId == null) return cur.course
            cur = byId[cur.parentId]
            depth++
        }
        return null
    }

    /** One shelf per folder that directly holds episodes of [course]; empty folders are not shelves. */
    fun shelves(folders: List<PodcastFolder>, episodes: List<PodcastEpisode>, progress: List<ListenProgress>, course: String): List<ListenShelfFolder> {
        val prog = progress.associateBy { it.episodeId }
        val byFolder = episodes.filter { course(it.folderId, folders) == course }.groupBy { it.folderId }
        return folders.mapNotNull { folder ->
            val eps = byFolder[folder.id]?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val done = eps.count { state(prog[it.id]) == ListenEpisodeState.Done }
            val heard = eps.sumOf { fraction(it, prog[it.id]) }
            ListenShelfFolder(
                folder = folder,
                level = level(folder.id, folders),
                room = room(folder),
                episodes = eps,
                doneCount = done,
                percent = if (done == eps.size) 100 else Math.floor(heard / eps.size * 100).toInt(),
                totalSeconds = eps.sumOf { it.durationSeconds },
            )
        }.sortedBy { it.folder.sortOrder } // stable: ties keep tree order
    }

    /** Levels that actually have a shelf, A1 first. */
    fun levels(shelves: List<ListenShelfFolder>): List<String> = shelves.mapNotNull { it.level }.distinct().sorted()

    /**
     * The most recently touched part-way episode; failing that the first unheard episode of the shelf last touched. Null
     * when the learner has never listened (the card is then not drawn).
     */
    fun continueListening(shelves: List<ListenShelfFolder>, progress: List<ListenProgress>): ListenContinueTarget? {
        val prog = progress.associateBy { it.episodeId }
        val touched = shelves.flatMap { s -> s.episodes.mapNotNull { e -> prog[e.id]?.let { Triple(s, e, it) } } }
            .sortedByDescending { it.third.updatedAt }
        touched.firstOrNull { state(it.third) == ListenEpisodeState.InProgress }?.let { return ListenContinueTarget(it.first, it.second, it.third) }
        val last = touched.firstOrNull() ?: return null
        val next = last.first.episodes.firstOrNull { state(prog[it.id]) == ListenEpisodeState.New } ?: return null
        return ListenContinueTarget(last.first, next, null)
    }
}
