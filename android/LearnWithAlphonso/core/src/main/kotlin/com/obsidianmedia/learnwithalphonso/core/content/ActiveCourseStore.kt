package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Where the active course is remembered; the app passes SharedPreferences, tests a map. */
interface CourseKeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
}

/**
 * The learner's active course, shared by Learn (which sets it through its course picker), Practice and Hector (which
 * follow it), and remembered per account (ActiveCourseModel.swift and the Kit's ActiveCoursePreference: the same
 * `activeCourse.<userId>` key). English when signed out or when the account has never chosen; nothing is remembered
 * while signed out. Main thread only.
 */
class ActiveCourseStore(private val store: CourseKeyValueStore) {
    private var userId: String? = null
    private val _course = MutableStateFlow(Course.ENGLISH)
    val course: StateFlow<Course> = _course.asStateFlow()

    /** The signed-in account changed (or is now known): show that account's own course, English if it has none. */
    fun accountChanged(userId: String?) {
        this.userId = userId
        _course.value = load(userId)
    }

    fun set(course: Course) {
        _course.value = course
        userId?.let { store.put(keyFor(it), course.code) }
    }

    private fun load(userId: String?): Course {
        if (userId == null) return Course.ENGLISH
        val code = store.get(keyFor(userId)) ?: return Course.ENGLISH
        return Course.entries.firstOrNull { it.code == code } ?: Course.ENGLISH
    }

    companion object {
        const val KEY_PREFIX = "activeCourse."
        fun keyFor(userId: String): String = KEY_PREFIX + userId
    }
}
