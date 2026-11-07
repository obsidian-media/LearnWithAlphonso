package com.obsidianmedia.learnwithalphonso.core.firstrun

import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.logic.LessonStage
import com.obsidianmedia.learnwithalphonso.core.logic.LessonTiming
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import com.obsidianmedia.learnwithalphonso.core.content.Unit as CourseUnit

class FirstRunTest {
    private fun store(draft: FirstRunKeyValue = InMemoryFirstRunKeyValue(), block: FirstRunKeyValue = InMemoryFirstRunKeyValue()) =
        FirstRunStore(draft, block)

    // ---------------------------------------------------------------- under 13

    @Test
    fun `under 13 blocks, wipes the answers and keeps the flag`() {
        val draft = InMemoryFirstRunKeyValue()
        val block = InMemoryFirstRunKeyValue()
        val s = store(draft, block)
        s.writeDraft(LearnerAnswers(name = "Sam", course = "es", goal = "travel"))
        assertEquals(AgeOutcome.BLOCKED, FirstRun.chooseAge(s, AgeChoice.UNDER_13))
        assertTrue(s.isBlocked())
        assertNull(draft.get(FirstRunStore.DRAFT_KEY), "the answers are wiped from the device")
        assertEquals("1", block.get(FirstRunStore.UNDER_13_KEY))
        assertEquals(LearnerAnswers(), s.readDraft())
    }

    @Test
    fun `going back and picking an older range does not get through`() {
        val s = store()
        FirstRun.chooseAge(s, AgeChoice.UNDER_13)
        AgeChoice.entries.filter { it != AgeChoice.UNDER_13 }.forEach {
            assertEquals(AgeOutcome.BLOCKED, FirstRun.chooseAge(s, it), it.id)
        }
        assertNull(s.readDraft().ageRange)
    }

    @Test
    fun `the block survives a relaunch`() {
        val draft = InMemoryFirstRunKeyValue()
        val block = InMemoryFirstRunKeyValue()
        FirstRun.chooseAge(store(draft, block), AgeChoice.UNDER_13)
        val relaunched = store(draft, block)
        assertTrue(relaunched.isBlocked())
        assertEquals(AgeOutcome.BLOCKED, FirstRun.chooseAge(relaunched, AgeChoice.ADULT))
        relaunched.writeDraft(LearnerAnswers(name = "Sam"))
        assertNull(draft.get(FirstRunStore.DRAFT_KEY), "a blocked device writes no answers")
    }

    @Test
    fun `a blocked device sends nothing even if answers are left on it`() {
        val draft = InMemoryFirstRunKeyValue(mapOf(FirstRunStore.DRAFT_KEY to LearnerAnswers.encode(LearnerAnswers(name = "Sam", goal = "work"))))
        val block = InMemoryFirstRunKeyValue(mapOf(FirstRunStore.UNDER_13_KEY to "1"))
        assertNull(FirstRun.answersToSend(store(draft, block)))
    }

    @Test
    fun `the block holds for the launch even when its storage cannot keep it`() {
        val broken = object : FirstRunKeyValue {
            override fun get(key: String): String? = null
            override fun set(key: String, value: String?) {}
        }
        val s = FirstRunStore(InMemoryFirstRunKeyValue(), broken)
        FirstRun.chooseAge(s, AgeChoice.UNDER_13)
        assertTrue(s.isBlocked())
        assertEquals(AgeOutcome.BLOCKED, FirstRun.chooseAge(s, AgeChoice.TEEN))
    }

    @Test
    fun `an older range is saved to the draft`() {
        val s = store()
        assertEquals(AgeOutcome.OK, FirstRun.chooseAge(s, AgeChoice.YOUNG_ADULT))
        assertEquals("18-24", s.readDraft().ageRange)
        assertFalse(s.isBlocked())
    }

    @Test
    fun `the server list has no under-13 range`() {
        assertFalse(AgeChoice.UNDER_13.id in LearnerProfileLists.ageRanges)
        assertEquals(LearnerProfileLists.ageRanges, AgeChoice.entries.filter { it != AgeChoice.UNDER_13 }.map { it.id })
    }

    // ---------------------------------------------------------------- answers

    @Test
    fun `clean answers drops values off the lists and keeps the rest`() {
        val draft = LearnerAnswers(
            name = "  Sam  ", course = "de", nativeLanguage = "fa", country = "ZZ", goal = "travel", level = "expert",
            dailyMinutes = 7, ageRange = "12", interests = listOf("food", "gaming"), heardFrom = "tv",
        )
        assertEquals(LearnerAnswers(name = "Sam", nativeLanguage = "fa", goal = "travel", interests = listOf("food")), FirstRun.cleanAnswers(draft))
    }

    @Test
    fun `the flag is sent only when it was answered`() {
        assertNull(FirstRun.cleanAnswers(LearnerAnswers(goal = "work"))!!.jsonPatch()["showFlag"])
        assertEquals(JsonPrimitive(false), FirstRun.cleanAnswers(LearnerAnswers(showFlag = false))!!.jsonPatch()["showFlag"])
    }

    @Test
    fun `nothing answered is nothing to send`() {
        assertNull(FirstRun.answersToSend(store()))
        assertNull(FirstRun.cleanAnswers(LearnerAnswers(name = "   ")))
    }

    @Test
    fun `parse reads the account field by field`() {
        val p = LearnerProfile.parse(buildJsonObject {
            put("name", "Sam"); put("goal", "work"); put("ageRange", "under-13"); put("country", "CA"); put("showFlag", "yes")
            put("dailyMinutes", 12); putJsonArray("interests") { add("food"); add("nope") }
            put("completedAt", "2026-11-06T10:00:00.000Z"); put("dismissedAt", "yesterday")
        })
        assertEquals("Sam", p.answers.name)
        assertNull(p.answers.ageRange)
        assertEquals(false, p.answers.showFlag, "only a real true turns the flag on")
        assertNull(p.answers.dailyMinutes)
        assertEquals(listOf("food"), p.answers.interests)
        assertEquals("2026-11-06T10:00:00.000Z", p.completedAt)
        assertNull(p.dismissedAt)
        assertFalse(p.needsCompleteProfile)
        assertTrue(LearnerProfile.parse(null).needsCompleteProfile)
    }

    // ---------------------------------------------------------------- steps and copy

    @Test
    fun `eight questions for a new learner, seven without the course`() {
        assertEquals(8, FirstRun.questionSteps(FirstRun.Mode.NEW).size)
        assertEquals(7, FirstRun.questionSteps(FirstRun.Mode.COMPLETE).size)
        assertFalse(FirstRun.QuestionStep.COURSE in FirstRun.questionSteps(FirstRun.Mode.COMPLETE))
    }

    @Test
    fun `the room follows the goal then the course`() {
        assertEquals("room-light", FirstRun.room(null, null))
        assertEquals("coffee", FirstRun.room("es", null))
        assertEquals("airport", FirstRun.room("es", "travel"))
    }

    @Test
    fun `greetings, praise and the plan summary read like the web`() {
        assertEquals("¡Hola, Sam!", FirstRun.greeting("es", "Sam"))
        assertEquals("Bonjour !", FirstRun.greeting("fr", ""))
        assertEquals("¡Muy bien, Sam!", FirstRun.praise("es", "Sam"))
        assertEquals(
            listOf("Spanish for travel · I know some", "10 minutes a day", "Food and music"),
            FirstRun.planSummary(LearnerAnswers(goal = "travel", level = "some", interests = listOf("food", "music")), "es"),
        )
        assertEquals("About food, music, art and your week", FirstRun.hectorTopics(listOf("food", "music", "art", "tech")))
    }

    @Test
    fun `every course has two taste questions with a valid answer`() {
        LearnerProfileLists.courses.forEach { c ->
            val items = FirstRun.miniLessons[c].orEmpty()
            assertEquals(2, items.size, c)
            items.forEach { assertTrue(it.answer in it.choices.indices) }
        }
    }

    @Test
    fun `destination after the first run`() {
        assertEquals(FirstRun.Destination.HECTOR, FirstRun.destination(FirstRun.FinishTarget.HECTOR, "some", false))
        assertEquals(FirstRun.Destination.PLACEMENT, FirstRun.destination(FirstRun.FinishTarget.LESSON, "some", false))
        assertEquals(FirstRun.Destination.LEARN, FirstRun.destination(FirstRun.FinishTarget.LESSON, "some", true))
        assertEquals(FirstRun.Destination.LEARN, FirstRun.destination(FirstRun.FinishTarget.LESSON, "new", false))
    }

    // ---------------------------------------------------------------- trial line

    @Test
    fun `the trial line comes only from a store offer`() {
        assertNull(FirstRun.trialLine(null), "no offer, no line")
        assertNull(FirstRun.trialLine(0))
        assertEquals("7 days free, then your plan's price. Cancel any time.", FirstRun.trialLine(7))
        assertEquals("1 day free, then your plan's price. Cancel any time.", FirstRun.trialLine(1))
        assertEquals("See what Hector can do", FirstRun.hectorButton(false))
    }

    @Test
    fun `trial days from a Play billing period`() {
        assertEquals(3, FirstRun.trialDays("P3D"))
        assertEquals(7, FirstRun.trialDays("P1W"))
        assertEquals(30, FirstRun.trialDays("P1M"))
        assertNull(FirstRun.trialDays(null))
        assertNull(FirstRun.trialDays("P0D"))
        assertNull(FirstRun.trialDays("seven days"))
    }

    @Test
    fun `the longest offered trial wins and no offer means no trial`() {
        assertEquals(14, FirstRun.trialDays(listOf(null, "P1W", "P14D")))
        assertNull(FirstRun.trialDays(listOf(null, null)))
        assertNull(FirstRun.trialDays(emptyList<String?>()))
    }

    // ---------------------------------------------------------------- Complete your profile

    @Test
    fun `complete your profile keeps a leaderboard country showing`() {
        val p = FirstRun.completeProfilePrefill(LearnerProfile(), "Robin Hood", "GB")
        assertEquals("Robin", p.name)
        assertEquals("GB", p.country)
        assertEquals(true, p.showFlag)
    }

    @Test
    fun `complete your profile never uses a handle and starts with the flag off`() {
        val p = FirstRun.completeProfilePrefill(LearnerProfile(LearnerAnswers(country = "FR", showFlag = false)), "Learner-1A2B", null)
        assertNull(p.name)
        assertEquals("FR", p.country)
        assertEquals(false, p.showFlag)
    }

    // ---------------------------------------------------------------- plan

    private fun unit(id: String, level: String, title: String, questions: Int) = CourseUnit(
        id, level, "", title, "",
        listOf(Lesson("$id-1", "L", "", (0 until questions).map { Question.MultipleChoice("$id-q$it", "p", listOf("a", "b"), 0, "e") })),
    )

    @Test
    fun `the plan starts at the level the learner chose`() {
        val units = listOf(
            unit("a1-1", "A1", "Hello", 10), unit("a2-1", "A2", "Food", 10), unit("a2-2", "A2", "Past", 10),
            unit("a2-3", "A2", "Places", 10), unit("a2-4", "A2", "Later", 10),
        )
        val plan = FirstRun.plan(units, "some", 5, Instant.parse("2026-11-06T12:00:00Z"), LessonTiming(mapOf("mc" to 60), 0), emptyMap())
        assertEquals(listOf("Food", "Past", "Places"), plan.nodes.map { it.title })
        assertEquals("Past", plan.goalUnitTitle)
        assertEquals("10 November", FirstRun.formatDay(plan.goalDate))
        assertEquals(LessonStage.FALLBACK_ROOM, plan.nodes.first().room)
    }
}

class ProfileAvatarsTest {
    @Test
    fun `sixteen animals with the web's ids`() {
        assertEquals(
            listOf("llama-rose", "llama-cocoa", "alpaca", "fox", "owl", "cat", "panda", "bear", "rabbit", "penguin",
                "parrot", "koala", "lion", "hedgehog", "corgi", "deer"),
            ProfileAvatars.all.map { it.id },
        )
    }

    @Test
    fun `seeds round trip and anything else is initials`() {
        assertEquals("animal:fox", ProfileAvatars.seedFor("fox"))
        assertEquals("Fox", ProfileAvatars.animalFromSeed("animal:fox")?.label)
        assertNull(ProfileAvatars.animalFromSeed("animal:dragon"))
        assertNull(ProfileAvatars.animalFromSeed("3f9a2c1d"))
    }

    @Test
    fun `only listed animals or plain colour seeds may be written`() {
        assertTrue(ProfileAvatars.isAllowedSeed("animal:owl"))
        assertTrue(ProfileAvatars.isAllowedSeed("3f9a2c1d"))
        assertFalse(ProfileAvatars.isAllowedSeed("animal:dragon"))
        assertFalse(ProfileAvatars.isAllowedSeed("https://example.com/a.png"))
        assertFalse(ProfileAvatars.isAllowedSeed(""))
        assertEquals("3f9a2c1d", ProfileAvatars.initialsSeed("3f9a2c1d"))
        assertEquals("a", ProfileAvatars.initialsSeed("animal:fox"))
        assertEquals("S", ProfileAvatars.initial(" sam"))
    }
}
