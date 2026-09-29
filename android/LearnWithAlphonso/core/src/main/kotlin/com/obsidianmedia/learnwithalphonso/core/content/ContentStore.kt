package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.serializer

/**
 * Decodes the ten bundled JSON files once. `load` is the platform seam: the
 * app passes an AssetManager reader, core tests pass a classpath reader over
 * the same directory (core/build.gradle.kts adds app/src/main/assets as a
 * test resource root).
 */
class ContentStore(private val load: (String) -> String) {
    private val bundles: Map<Course, ContentBundle> =
        Course.entries.associateWith { decode<ContentBundle>("content/curriculum-${it.code}.json") }
    private val placement: Map<Course, List<PlacementQuestion>> =
        Course.entries.associateWith { decode<List<PlacementQuestion>>("content/placement-${it.code}.json") }

    val scenarios: List<Scenario> = decode("content/scenarios.json")
    val campaigns: List<Campaign> = decode("content/campaigns.json")
    val achievements: List<Achievement> = decode("content/achievements.json")
    val vocabImages: Map<String, VocabImageRef> = decode("content/vocab-images.json")

    fun bundle(course: Course): ContentBundle = bundles.getValue(course)

    fun placementPool(course: Course): List<PlacementQuestion> = placement.getValue(course)

    fun findLesson(id: String, course: Course): Pair<Unit, Lesson>? =
        bundle(course).units.firstNotNullOfOrNull { unit ->
            unit.lessons.firstOrNull { it.id == id }?.let { unit to it }
        }

    private inline fun <reified T> decode(name: String): T =
        ContentJson.json.decodeFromString(serializer<T>(), load(name))
}
