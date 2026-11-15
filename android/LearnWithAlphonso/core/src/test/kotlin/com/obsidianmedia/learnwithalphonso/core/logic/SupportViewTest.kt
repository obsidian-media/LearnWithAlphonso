package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneId

class SupportViewTest {
    private val utc = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-14T15:00:00Z")

    private fun msg(id: Long, kind: SupportMessageKind) = SupportMessage(id, kind, "m$id", "2026-11-14T09:41:00Z", null)

    @Test
    fun `banner by status, the way the mock draws it`() {
        fun b(s: SupportStatus?, ai: Boolean = true, declined: Boolean = false, online: Boolean = true) = SupportView.bannerFor(s, ai, declined, online)
        assertNull(b(null))
        assertEquals(SupportBanner.TEAM, b(SupportStatus.NEW))
        assertEquals(SupportBanner.TEAM, b(SupportStatus.OPEN))
        assertEquals(SupportBanner.WAIT, b(SupportStatus.WAITING_LEARNER))
        assertEquals(SupportBanner.DONE, b(SupportStatus.SOLVED))
        assertEquals(SupportBanner.AI, b(SupportStatus.NONE))
        assertEquals(SupportBanner.AI, b(SupportStatus.AI))
        // AI off (the launch state): a person answers, whatever the learner chose.
        assertEquals(SupportBanner.PERSON, b(SupportStatus.NONE, ai = false))
        assertEquals(SupportBanner.PERSON, b(SupportStatus.AI, ai = false, declined = true))
        assertEquals(SupportBanner.DECLINED, b(SupportStatus.NONE, declined = true))
        // Offline wins, even before the first load.
        assertEquals(SupportBanner.OFFLINE, b(null, online = false))
        assertEquals(SupportBanner.OFFLINE, b(SupportStatus.OPEN, online = false))
    }

    @Test
    fun `composer words follow the status and the limits`() {
        fun c(s: SupportStatus?, limit: SendLimit? = null, online: Boolean = true, first: Boolean = false) = SupportView.composerFor(s, limit, online, first)
        assertEquals(SupportComposer("Write your message", "Don't send passwords or card numbers.", false), c(SupportStatus.NONE))
        assertEquals(SupportCopy.AI_FINE, c(SupportStatus.NONE, first = true).fine)
        assertEquals("Add something", c(SupportStatus.OPEN).placeholder)
        assertEquals("Add something", c(SupportStatus.NEW).placeholder)
        assertEquals("Reply to the team", c(SupportStatus.WAITING_LEARNER).placeholder)
        assertEquals("Still need help? Write here", c(SupportStatus.SOLVED).placeholder)
        assertEquals(SupportCopy.FINE_SOLVED, c(SupportStatus.SOLVED).fine)
        assertEquals(SupportCopy.FINE_OFFLINE, c(SupportStatus.OPEN, online = false).fine)
        // A limit closes the box and says why; the conversation limit has no fine print.
        assertEquals(SupportComposer("Come back tomorrow to write again", "Limit: 50 messages a day.", true), c(SupportStatus.OPEN, SendLimit.DAILY))
        assertEquals(SupportComposer("This chat is full", "", true), c(SupportStatus.OPEN, SendLimit.CONVERSATION))
    }

    @Test
    fun `polling is for a chat a person has, not one the AI is answering`() {
        assertFalse(SupportView.shouldPoll(null))
        assertFalse(SupportView.shouldPoll(SupportStatus.AI))
        for (s in listOf(SupportStatus.NONE, SupportStatus.NEW, SupportStatus.OPEN, SupportStatus.WAITING_LEARNER, SupportStatus.SOLVED)) assertTrue(SupportView.shouldPoll(s), "$s")
        assertEquals(20_000L, SupportView.POLL_INTERVAL_MS)
    }

    @Test
    fun `the new reply divider sits at the first unread person reply`() {
        val all = listOf(msg(1, SupportMessageKind.YOU), msg(2, SupportMessageKind.SUPPORT), msg(3, SupportMessageKind.YOU), msg(4, SupportMessageKind.SUPPORT), msg(5, SupportMessageKind.SUPPORT))
        assertNull(SupportView.unreadDividerId(all, 0))
        assertEquals(5L, SupportView.unreadDividerId(all, 1))
        assertEquals(4L, SupportView.unreadDividerId(all, 2))
        assertEquals(2L, SupportView.unreadDividerId(all, 3))
        // More unread than person replies (an AI reply is not one): the first person reply.
        assertEquals(2L, SupportView.unreadDividerId(all, 9))
        assertNull(SupportView.unreadDividerId(listOf(msg(1, SupportMessageKind.AI)), 1))
    }

    @Test
    fun `merging keeps one copy per id, oldest first, the newer copy winning`() {
        val a = listOf(msg(3, SupportMessageKind.YOU), msg(1, SupportMessageKind.YOU))
        val b = listOf(msg(2, SupportMessageKind.AI), SupportMessage(3, SupportMessageKind.YOU, "edited", "2026-11-14T09:41:00Z", null))
        val merged = SupportView.mergeMessages(a, b)
        assertEquals(listOf(1L, 2L, 3L), merged.map { it.id })
        assertEquals("edited", merged.last().body)
    }

    @Test
    fun `day and time labels`() {
        assertEquals("Today", SupportView.dayLabel("2026-11-14T01:00:00Z", now, utc))
        assertEquals("Yesterday", SupportView.dayLabel("2026-11-13T23:00:00Z", now, utc))
        assertEquals("10 Nov", SupportView.dayLabel("2026-11-10T09:00:00Z", now, utc))
        assertEquals("9:41 AM", SupportView.timeLabel("2026-11-14T09:41:00Z", now, utc))
        assertEquals("Wed 11:12 AM", SupportView.timeLabel("2026-11-11T11:12:00Z", now, utc))
        assertEquals("2 Nov, 10:02 AM", SupportView.timeLabel("2026-11-02T10:02:00Z", now, utc))
        // The learner's own zone decides which day it is.
        assertEquals("Yesterday", SupportView.dayLabel("2026-11-14T01:00:00Z", now, ZoneId.of("America/Los_Angeles")))
        assertEquals("2026-11-14", SupportView.dayKey("2026-11-14T09:41:00Z", utc))
    }

    @Test
    fun `the AI is Miya and a person is never Miya, with or without a name`() {
        fun row(kind: SupportMessageKind, staffName: String? = null) = SupportMessage(1, kind, "x", "2026-11-14T09:41:00Z", null, staffName)
        assertEquals("Miya (AI helper)", SupportView.speakerLabel(row(SupportMessageKind.AI)))
        assertEquals("Dana \u00B7 Support team", SupportView.speakerLabel(row(SupportMessageKind.SUPPORT, "Dana")))
        assertEquals("Support team", SupportView.speakerLabel(row(SupportMessageKind.SUPPORT)))
        assertEquals("Support team", SupportView.speakerLabel(row(SupportMessageKind.SUPPORT, "  ")))
        // Even a staff member called Miya is not drawn as her.
        assertEquals("Support team", SupportView.speakerLabel(row(SupportMessageKind.SUPPORT, "Miya")))
        assertNull(SupportView.speakerLabel(row(SupportMessageKind.YOU)))
        assertNull(SupportView.speakerLabel(row(SupportMessageKind.SYSTEM)))
        // A name on an AI row is ignored: she keeps her own label.
        assertEquals("Miya (AI helper)", SupportView.speakerLabel(row(SupportMessageKind.AI, "Dana")))
    }

    @Test
    fun `Miya's hand-off pose shows only above the hand-off line, and only when she answered first`() {
        fun m(kind: SupportMessageKind, body: String = "x") = SupportMessage(1, kind, body, "2026-11-14T09:41:00Z", null)
        val notice = SupportView.HANDOFF_NOTICE
        assertEquals("A person will reply here.", notice)
        assertTrue(SupportView.showsHandoffPose(listOf(m(SupportMessageKind.YOU), m(SupportMessageKind.AI), m(SupportMessageKind.SYSTEM, notice)), 2))
        assertFalse(SupportView.showsHandoffPose(listOf(m(SupportMessageKind.YOU), m(SupportMessageKind.SYSTEM, notice)), 1))
        val other = listOf(m(SupportMessageKind.YOU), m(SupportMessageKind.AI), m(SupportMessageKind.SYSTEM, "This chat was marked solved."), m(SupportMessageKind.SUPPORT, notice))
        assertFalse(SupportView.showsHandoffPose(other, 2))
        assertFalse(SupportView.showsHandoffPose(other, 3))
        assertFalse(SupportView.showsHandoffPose(other, 9))
    }

    @Test
    fun `the words the server and the other platforms also say`() {
        assertEquals("We couldn't reach support. Your message is saved. Try again in a moment.", SupportCopy.UNREACHABLE)
        assertEquals("You have reached today's limit of messages to Help. Try again tomorrow.", SupportCopy.DAILY_LIMIT)
        assertEquals("Talk to a person", SupportCopy.TALK_TO_PERSON)
        assertEquals(7, SupportCopy.STARTERS.size)
        assertEquals(50, SupportCopy.DAILY_LIMIT_MESSAGES)
    }
}
