package com.obsidianmedia.learnwithalphonso.core.profile

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ProfileTabsTest {
    @Test
    fun `every section lives on exactly one tab, none dropped or duplicated`() {
        val placed = ProfileTabs.TAB_SECTIONS.values.flatten()
        assertEquals(placed.size, placed.toSet().size, "a section is on two tabs")
        assertEquals(ProfileTabs.ALL_SECTIONS.toSet(), placed.toSet(), "a section was dropped or invented")
        assertEquals(ProfileSection.entries.toSet(), placed.toSet())
        assertEquals(ProfileTabs.tabs.toSet(), ProfileTabs.TAB_SECTIONS.keys)
    }

    @Test
    fun `assignment matches the web`() {
        assertEquals(listOf(ProfileSection.BIG_NUMBERS, ProfileSection.THIS_WEEK, ProfileSection.HECTOR, ProfileSection.SETTINGS), ProfileTabs.TAB_SECTIONS[ProfileTab.OVERVIEW])
        assertEquals(listOf(ProfileSection.LEAGUE, ProfileSection.FRIENDS, ProfileSection.SHARE), ProfileTabs.TAB_SECTIONS[ProfileTab.SOCIAL])
        assertEquals(ProfileSection.SKILLS, ProfileTabs.TAB_SECTIONS[ProfileTab.PROGRESS]!!.first())
    }

    @Test
    fun `labels are in order`() {
        assertEquals(listOf("Overview", "Progress", "Social"), ProfileTabs.tabs.map { it.label })
    }

    @Test
    fun `stepTab clamps at the ends`() {
        assertEquals(ProfileTab.PROGRESS, ProfileTabs.stepTab(ProfileTab.OVERVIEW, 1))
        assertEquals(ProfileTab.OVERVIEW, ProfileTabs.stepTab(ProfileTab.OVERVIEW, -1))
        assertEquals(ProfileTab.SOCIAL, ProfileTabs.stepTab(ProfileTab.SOCIAL, 1))
    }

    @Test
    fun `summaries`() {
        assertEquals("1 active day", ProfileTabs.heatSummary(1))
        assertEquals("1,234 active days", ProfileTabs.heatSummary(1234))
        assertEquals("Best streak 12", ProfileTabs.recordsSummary(12))
        assertEquals("Nothing to review", ProfileTabs.weakSummary(0))
        assertEquals("3 to review", ProfileTabs.weakSummary(3))
        assertEquals("4 of 20", ProfileTabs.achievementsSummary(4, 20))
    }
}
