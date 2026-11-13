package com.obsidianmedia.learnwithalphonso.core.video

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The captions parser for the Watch shelf's player; the same cases as the iOS WebVTTTests. */
class WebVttTest {
    private val sample = """WEBVTT

1
00:00:00.400 --> 00:00:04.942
Saying "I want a coffee" isn't wrong... but it can sound a little blunt.

2
00:00:04.942 --> 00:00:07.024
Here's how to order like a local.

3
00:00:08.024 --> 00:00:15.872
Just swap "I want" for "I'd like."
"I'd like a coffee, please.""""

    @Test fun `parses every cue with its times`() {
        val cues = WebVtt.parse(sample)
        assertEquals(3, cues.size)
        assertEquals(0.4, cues[0].start, 0.0001)
        assertEquals(4.942, cues[0].end, 0.0001)
        assertEquals(8.024, cues[2].start, 0.0001)
        assertEquals("Here's how to order like a local.", cues[1].text)
    }

    @Test fun `a multi-line cue keeps its lines`() {
        assertEquals("Just swap \"I want\" for \"I'd like.\"\n\"I'd like a coffee, please.\"", WebVtt.parse(sample)[2].text)
    }

    @Test fun `cue lookup at a time`() {
        val cues = WebVtt.parse(sample)
        assertNull(WebVtt.cueAt(0.1, cues), "before the first cue")
        assertTrue(WebVtt.cueAt(0.4, cues)!!.text.startsWith("Saying"), "a cue starts at its start time")
        assertTrue(WebVtt.cueAt(4.941, cues)!!.text.startsWith("Saying"))
        assertTrue(WebVtt.cueAt(4.942, cues)!!.text.startsWith("Here's"), "the end is exclusive: the next cue takes over")
        assertNull(WebVtt.cueAt(7.5, cues), "a gap between cues shows nothing")
        assertNotNull(WebVtt.cueAt(15.871, cues))
        assertNull(WebVtt.cueAt(15.872, cues), "after the last cue")
        assertNull(WebVtt.cueAt(Double.NaN, cues))
    }

    @Test fun `overlapping cues show the one that started last`() {
        val cues = WebVtt.parse("WEBVTT\n\n00:00.000 --> 00:10.000\nlong\n\n00:02.000 --> 00:04.000\nshort\n")
        assertEquals("long", WebVtt.cueAt(1.0, cues)?.text)
        assertEquals("short", WebVtt.cueAt(3.0, cues)?.text)
        assertEquals("long", WebVtt.cueAt(5.0, cues)?.text)
    }

    @Test fun `timestamps with and without hours`() {
        assertEquals(3723.5, WebVtt.timestamp("01:02:03.500")!!, 0.0001)
        assertEquals(123.5, WebVtt.timestamp("02:03.500")!!, 0.0001)
        assertEquals(7.25, WebVtt.timestamp("7.25")!!, 0.0001)
        assertNull(WebVtt.timestamp("abc"))
        assertNull(WebVtt.timestamp("1:2:3:4"))
        assertNull(WebVtt.timestamp(""))
    }

    @Test fun `CRLF, a BOM, cue settings and tags are handled`() {
        val text = "﻿WEBVTT - title\r\n\r\nintro\r\n00:01.000 --> 00:02.000 align:start position:10%\r\n<c.yellow>Hello</c> <b>there</b> &amp; welcome\r\n"
        val cues = WebVtt.parse(text)
        assertEquals(1, cues.size)
        assertEquals("Hello there & welcome", cues[0].text)
        assertEquals(2.0, cues[0].end, 0.0001)
    }

    @Test fun `NOTE, STYLE and REGION blocks are skipped and bad cues dropped`() {
        val text = """WEBVTT

NOTE this is a comment
00:00.000 --> 00:01.000
not a cue

STYLE
::cue { color: red }

00:03.000 --> 00:02.000
ends before it starts

00:04.000 --> 00:05.000

00:06.000 --> 00:07.000
kept"""
        assertEquals(listOf("kept"), WebVtt.parse(text).map { it.text })
    }

    @Test fun `cues out of order are sorted by start`() {
        val cues = WebVtt.parse("WEBVTT\n\n00:05.000 --> 00:06.000\nsecond\n\n00:01.000 --> 00:02.000\nfirst\n")
        assertEquals(listOf("first", "second"), cues.map { it.text })
    }

    @Test fun `a file that is not WebVTT gives no cues`() {
        assertEquals(emptyList<WebVttCue>(), WebVtt.parse("1\n00:00:01,000 --> 00:00:02,000\nHi\n"))
        assertEquals(emptyList<WebVttCue>(), WebVtt.parse(""))
        assertEquals(emptyList<WebVttCue>(), WebVtt.parse("WEBVTTX\n\n00:01.000 --> 00:02.000\nHi"))
    }
}
