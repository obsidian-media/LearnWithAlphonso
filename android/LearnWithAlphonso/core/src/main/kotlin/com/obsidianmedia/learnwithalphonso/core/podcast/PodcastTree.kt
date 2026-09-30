package com.obsidianmedia.learnwithalphonso.core.podcast

/**
 * Port of src/lib/podcast-tree.ts (tests: podcast-tree.test.ts) and
 * PodcastTree.swift. Handles arbitrary depth; a folder whose parent is
 * absent is dropped, never promoted to a root, which also bounds a cyclic
 * tree because cycle members all have non-null parents.
 */
object PodcastTree {
    private val slug = Regex("^[a-z0-9]+(-[a-z0-9]+)*$")

    fun isValidSlug(value: String): Boolean = slug.matches(value)

    /** Direct children of [parentId] (null for the roots): sortOrder, then slug. */
    fun children(parentId: String?, folders: List<PodcastFolder>): List<PodcastFolder> =
        folders.filter { it.parentId == parentId }.sortedWith(compareBy({ it.sortOrder }, { it.slug }))

    /** Walks a slug path one level at a time, matching on (parentId, slug). */
    fun resolve(path: List<String>, folders: List<PodcastFolder>): PodcastFolder? {
        var parentId: String? = null
        var current: PodcastFolder? = null
        for (segment in path) {
            val match = folders.firstOrNull { it.parentId == parentId && it.slug == segment } ?: return null
            current = match
            parentId = match.id
        }
        return current
    }

    /** The ids in the first cycle found, or null when acyclic. */
    fun findCycle(folders: List<PodcastFolder>): List<String>? {
        val parentOf = folders.associate { it.id to it.parentId }
        for (folder in folders) {
            val seen = ArrayList<String>()
            var cursor: String? = folder.id
            while (cursor != null) {
                val start = seen.indexOf(cursor)
                if (start >= 0) return seen.subList(start, seen.size).toList()
                seen.add(cursor)
                cursor = parentOf[cursor]
            }
        }
        return null
    }
}
