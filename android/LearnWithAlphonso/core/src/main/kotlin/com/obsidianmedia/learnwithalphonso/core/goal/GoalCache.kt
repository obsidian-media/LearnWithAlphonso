package com.obsidianmedia.learnwithalphonso.core.goal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Where the cache keeps its strings (SharedPreferences in the app, memory in tests). */
interface GoalCacheStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)
}

/**
 * The last goal and plan this device saw, so the card can still show something when the network is down. Keyed by
 * user id AND course: a shared device must never show one account's goal to the next, and a cached plan is only ever
 * used for a network failure (never for a 401 or a server error; the model decides that, this class only stores).
 */
class GoalCache(private val store: GoalCacheStore) {
    companion object {
        fun key(userId: String, course: String) = "lwa.learning-goal.v1.$userId.$course"
    }

    /** A state is only worth keeping with BOTH a goal and a plan; anything else clears the entry. */
    fun write(state: LearningGoalState, userId: String?, course: String) {
        if (userId.isNullOrBlank()) return
        val goal = state.goal
        val plan = state.plan
        if (goal == null || plan == null) {
            store.remove(key(userId, course))
            return
        }
        store.put(key(userId, course), buildJsonObject {
            put("goal", buildJsonObject {
                put("course", goal.course); put("targetLevel", goal.targetLevel)
                put("targetDate", goal.targetDate); put("createdAt", goal.createdAt)
            })
            put("plan", planJson(plan))
        }.toString())
    }

    fun read(userId: String?, course: String): LearningGoalState? {
        if (userId.isNullOrBlank()) return null
        val text = store.get(key(userId, course)) ?: return null
        val state = runCatching { LearningGoalDecoding.state(text) }.getOrNull() ?: return null
        return if (state.goal != null && state.plan != null) state else null
    }

    fun clear(userId: String?, course: String) {
        if (userId.isNullOrBlank()) return
        store.remove(key(userId, course))
    }

    private fun planJson(plan: GoalPlan): JsonObject = buildJsonObject {
        put("currentLevel", plan.currentLevel); put("targetLevel", plan.targetLevel); put("targetDate", plan.targetDate)
        put("lessonsInScope", plan.lessonsInScope); put("lessonsRemaining", plan.lessonsRemaining)
        put("lessonsDoneLast7Days", plan.lessonsDoneLast7Days); put("requiredPerWeek", plan.requiredPerWeek)
        put("status", plan.status.wire); put("realism", plan.realism.wire)
        put("suggestedDate", plan.suggestedDate?.let { JsonPrimitive(it) } ?: JsonNull)
        put("asOf", plan.asOf)
    }
}
