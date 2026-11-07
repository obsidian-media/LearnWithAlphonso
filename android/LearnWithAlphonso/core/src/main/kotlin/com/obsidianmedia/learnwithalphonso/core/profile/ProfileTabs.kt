package com.obsidianmedia.learnwithalphonso.core.profile

/**
 * Profile's three tabs (round 6.1); the same assignment as src/lib/profile-tabs.ts, pinned by a test so no section
 * is dropped or duplicated when Profile was split.
 */
enum class ProfileTab(val label: String) { OVERVIEW("Overview"), PROGRESS("Progress"), SOCIAL("Social") }

enum class ProfileSection {
    BIG_NUMBERS, THIS_WEEK, HECTOR, SETTINGS,
    SKILLS, HEAT_MAP, RECORDS, LEVEL, WEAK_SPOTS, ACHIEVEMENTS,
    LEAGUE, FRIENDS, SHARE,
}

object ProfileTabs {
    val tabs: List<ProfileTab> = ProfileTab.entries

    val TAB_SECTIONS: Map<ProfileTab, List<ProfileSection>> = mapOf(
        ProfileTab.OVERVIEW to listOf(ProfileSection.BIG_NUMBERS, ProfileSection.THIS_WEEK, ProfileSection.HECTOR, ProfileSection.SETTINGS),
        ProfileTab.PROGRESS to listOf(
            ProfileSection.SKILLS, ProfileSection.HEAT_MAP, ProfileSection.RECORDS, ProfileSection.LEVEL,
            ProfileSection.WEAK_SPOTS, ProfileSection.ACHIEVEMENTS,
        ),
        ProfileTab.SOCIAL to listOf(ProfileSection.LEAGUE, ProfileSection.FRIENDS, ProfileSection.SHARE),
    )

    /** Every section Profile had before the split (plus the skills slot). */
    val ALL_SECTIONS: List<ProfileSection> = listOf(
        ProfileSection.BIG_NUMBERS, ProfileSection.THIS_WEEK, ProfileSection.HEAT_MAP, ProfileSection.RECORDS,
        ProfileSection.LEVEL, ProfileSection.WEAK_SPOTS, ProfileSection.HECTOR, ProfileSection.ACHIEVEMENTS,
        ProfileSection.LEAGUE, ProfileSection.FRIENDS, ProfileSection.SHARE, ProfileSection.SETTINGS, ProfileSection.SKILLS,
    )

    /** Swipe / key step between tabs; clamps at the ends. */
    fun stepTab(current: ProfileTab, delta: Int): ProfileTab =
        tabs[(tabs.indexOf(current) + delta).coerceIn(0, tabs.lastIndex)]

    private fun plural(n: Int, one: String, many: String) = if (n == 1) one else many
    private fun grouped(n: Int) = java.text.NumberFormat.getIntegerInstance(java.util.Locale.US).format(n)

    fun heatSummary(activeDays: Int) = "${grouped(activeDays)} active ${plural(activeDays, "day", "days")}"
    fun recordsSummary(bestStreak: Int) = "Best streak ${grouped(bestStreak)}"
    fun weakSummary(total: Int) = if (total == 0) "Nothing to review" else "$total to review"
    fun achievementsSummary(unlocked: Int, total: Int) = "$unlocked of $total"
}
