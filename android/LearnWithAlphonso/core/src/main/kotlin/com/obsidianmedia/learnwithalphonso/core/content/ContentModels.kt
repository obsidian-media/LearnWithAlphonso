package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.Serializable

enum class Course(val code: String) {
    ENGLISH("en"),
    FRENCH("fr"),
    SPANISH("es");

    companion object {
        fun fromCode(code: String): Course = entries.firstOrNull { it.code == code }
            ?: throw IllegalArgumentException("Unknown course code: $code")
    }
}

@Serializable
data class Lesson(
    val id: String,
    val title: String,
    val subtitle: String,
    val questions: List<Question>,
)

@Serializable
data class Unit(
    val id: String,
    val level: String,
    val eyebrow: String,
    val title: String,
    val description: String,
    val lessons: List<Lesson>,
)

@Serializable
data class ContentBundle(
    val course: String,
    val units: List<Unit>,
)

@Serializable
data class Scenario(
    val id: String,
    val title: String,
    val emoji: String,
    val blurb: String,
    val level: String,
    val systemPrompt: String,
    val opener: String,
)

@Serializable
data class CampaignScene(
    val id: String,
    val title: String,
    val systemPrompt: String,
    val opener: String,
    val minTurns: Int,
)

@Serializable
data class Campaign(
    val id: String,
    val title: String,
    val emoji: String,
    val blurb: String,
    val level: String,
    val premise: String,
    val scenes: List<CampaignScene>,
)

@Serializable
data class Achievement(
    val id: String,
    val title: String,
    val description: String,
    val icon: String,
    val tier: String,
    val category: String,
    val threshold: Int,
)

@Serializable
data class VocabImageRef(
    val url: String,
    val alt: String,
    val credit: String,
    /** Provenance (App Store review fix, 2026-10); optional so older bundles decode. */
    val source: String? = null,
    val sourcePageUrl: String? = null,
    val license: String? = null,
    val reviewedBy: String? = null,
    val reviewedAt: String? = null,
)
