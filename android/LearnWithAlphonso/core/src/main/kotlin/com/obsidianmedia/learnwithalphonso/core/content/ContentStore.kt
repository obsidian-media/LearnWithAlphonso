package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.serializer

/**
 * Decodes the bundled JSON files once. `load` is the platform seam: the
 * app passes an AssetManager reader, core tests pass a classpath reader over
 * the same directory (core/build.gradle.kts adds app/src/main/assets as a
 * test resource root).
 */
class ContentStore(private val load: (String) -> String) {
    private val bundles: Map<Course, ContentBundle> =
        Course.entries.associateWith { decode<ContentBundle>("content/curriculum-${it.code}.json") }
    private val placement: Map<Course, List<PlacementQuestion>> =
        Course.entries.associateWith { decode<List<PlacementQuestion>>("content/placement-${it.code}.json") }

    /** Each course's conversation scenarios and campaigns: scenarios[-fr|-es].json and campaigns[-fr|-es].json (English has no suffix). */
    private val scenariosByCourse: Map<Course, List<Scenario>> =
        Course.entries.associateWith { decode<List<Scenario>>("content/scenarios${fileSuffix(it)}.json") }
    private val campaignsByCourse: Map<Course, List<Campaign>> =
        Course.entries.associateWith { decode<List<Campaign>>("content/campaigns${fileSuffix(it)}.json") }

    /** The English scenarios and campaigns. New code asks for a course with [scenarios] / [campaigns]. */
    val scenarios: List<Scenario> get() = scenarios(Course.ENGLISH)
    val campaigns: List<Campaign> get() = campaigns(Course.ENGLISH)
    val achievements: List<Achievement> = decode("content/achievements.json")
    val vocabImages: Map<String, VocabImageRef> = decode("content/vocab-images.json")

    fun bundle(course: Course): ContentBundle = bundles.getValue(course)

    fun scenarios(course: Course): List<Scenario> = scenariosByCourse.getValue(course)

    fun campaigns(course: Course): List<Campaign> = campaignsByCourse.getValue(course)

    private fun fileSuffix(course: Course): String = if (course == Course.ENGLISH) "" else "-${course.code}"

    fun placementPool(course: Course): List<PlacementQuestion> = placement.getValue(course)

    fun findLesson(id: String, course: Course): Pair<Unit, Lesson>? =
        bundle(course).units.firstNotNullOfOrNull { unit ->
            unit.lessons.firstOrNull { it.id == id }?.let { unit to it }
        }

    private inline fun <reified T> decode(name: String): T =
        ContentJson.json.decodeFromString(serializer<T>(), load(name))
}
