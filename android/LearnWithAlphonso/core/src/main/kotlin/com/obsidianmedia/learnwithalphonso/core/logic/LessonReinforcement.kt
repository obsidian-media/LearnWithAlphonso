package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Question

/**
 * Port of LessonReinforcement.swift / bank-engine.ts pickReinforcementQuestion:
 * one extra question on the concept the learner just missed. Callers must
 * exclude the current lesson's own questions from both pools first, because
 * question ids are only unique within a lesson.
 */

/** FNV-1a 32-bit over UTF-8 bytes; deterministic so a pick is testable. */
fun fnv1aHash(s: String): UInt {
    var h = 2_166_136_261u
    for (byte in s.toByteArray(Charsets.UTF_8)) {
        h = h xor (byte.toInt() and 0xFF).toUInt()
        h *= 16_777_619u
    }
    return h
}

fun pickReinforcementQuestion(
    siblingQuestions: List<Question>,
    levelQuestions: List<Question>,
    doingWell: Boolean,
    seed: String,
): Question? {
    val primary = if (doingWell) levelQuestions else siblingQuestions
    val fallback = if (doingWell) siblingQuestions else levelQuestions
    val pool = if (primary.isEmpty()) fallback else primary
    if (pool.isEmpty()) return null
    val index = (fnv1aHash(seed) % pool.size.toUInt()).toInt()
    return pool[index]
}
