package com.obsidianmedia.learnwithalphonso.core.profile

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * The Skills radar's rules (src/lib/skills-radar.ts on the web). Pure: it takes the per-skill scores from
 * ProfileMath.skillScores and says what to draw. A skill with too few answers has no vertex.
 */
object SkillsRadar {
    const val MIN_SKILL_ANSWERS = 5

    /** How many skills must have enough answers before a shape is drawn; below that the page shows the empty state. */
    const val MIN_SKILLS_FOR_RADAR = 3

    val SKILL_LABEL: Map<String, String> = mapOf(
        "listening" to "Listening",
        "speaking" to "Speaking",
        "vocabulary" to "Vocabulary",
        "grammar" to "Grammar",
        "reading" to "Reading",
    )

    data class RadarSkill(
        val skill: String,
        val label: String,
        val answered: Int,
        /** 0-100, or null while the skill has fewer than [MIN_SKILL_ANSWERS] answers. */
        val pct: Int?,
        /** Answers still needed before this skill is scored. */
        val needed: Int,
    )

    data class RadarModel(val ready: Boolean, val skills: List<RadarSkill>, val scored: Int, val lowest: RadarSkill?)

    fun radarModel(scores: List<ProfileSkillScore>): RadarModel {
        val skills = ProfileMath.SKILLS.map { skill ->
            val s = scores.firstOrNull { it.skill == skill }
            val answered = s?.answered ?: 0
            val pct = if (answered >= MIN_SKILL_ANSWERS) s?.pct?.coerceIn(0, 100) else null
            RadarSkill(skill, SKILL_LABEL.getValue(skill), answered, pct, max(0, MIN_SKILL_ANSWERS - answered))
        }
        val scored = skills.filter { it.pct != null }
        if (scored.size < MIN_SKILLS_FOR_RADAR) return RadarModel(false, skills, scored.size, null)
        val lowest = scored.reduce { a, b -> if (b.pct!! < a.pct!!) b else a }
        return RadarModel(true, skills, scored.size, lowest)
    }

    /** The point on axis [i] of [n] at radius [r] around the centre ([c], [c]); axis 0 points up. */
    fun radarPoint(i: Int, n: Int, r: Double, c: Double): Pair<Double, Double> {
        val a = -PI / 2 + i * 2 * PI / n
        return Pair(round1(c + r * cos(a)), round1(c + r * sin(a)))
    }

    /** The filled shape: one vertex per scored skill, at its score's share of the radius. Unscored skills add none. */
    fun radarPolygon(skills: List<RadarSkill>, radius: Double, c: Double): List<Pair<Double, Double>> =
        skills.mapIndexedNotNull { i, s -> s.pct?.let { radarPoint(i, skills.size, radius * it / 100.0, c) } }

    private fun round1(v: Double): Double = Math.round(v * 10.0) / 10.0
}
