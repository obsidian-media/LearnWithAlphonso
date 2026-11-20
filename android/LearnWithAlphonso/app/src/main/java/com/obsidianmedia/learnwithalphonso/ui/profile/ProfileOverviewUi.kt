package com.obsidianmedia.learnwithalphonso.ui.profile

import com.obsidianmedia.learnwithalphonso.core.logic.StreakDisplay
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.obsidianmedia.learnwithalphonso.core.content.Achievement
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.AchievementPresentation
import com.obsidianmedia.learnwithalphonso.core.logic.LeagueTierCopy
import com.obsidianmedia.learnwithalphonso.core.logic.deriveVocab
import com.obsidianmedia.learnwithalphonso.ui.achievements.Medallion
import com.obsidianmedia.learnwithalphonso.ui.learn.LeagueTierPalette
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileTab
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileTabs
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileOverviewData
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileWeakItem
import com.obsidianmedia.learnwithalphonso.core.profile.SkillsRadar
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.ProfileAvatar
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import java.io.File

/**
 * The Profile redesign (visual round 6, part 4; the web's ProfileSections.tsx and ProfileOverviewView.swift). Every
 * number comes from [ProfileOverviewData] (one batched read) through [ProfileMath]; no figure is typed into a view.
 */
class ProfileOverviewModel(
    val data: ProfileOverviewData, content: ContentStore, val course: Course, isPro: Boolean,
    /** The learner's chosen daily time (LearnerProfile.dailyMinutes), or null when they never picked one. */
    val dailyGoalMinutes: Int? = null,
) {
    val big = ProfileMath.bigNumbers(data) { id ->
        content.findLesson(id, course)?.let { (_, lesson) -> deriveVocab(lesson, emptyMap()).map { it.term } } ?: emptyList()
    }
    val week = ProfileMath.weekRings(data.today, data.activity, data.speech)
    /** This week as the Overview strip shows it (minutes against the goal, else the XP rule). */
    val strip = ProfileMath.weekStrip(data.today, data.activity, data.speech, data.learning, dailyGoalMinutes?.takeIf { it > 0 })
    val goal = dailyGoalMinutes?.takeIf { it > 0 }?.let { ProfileMath.goalRings(data.today, data.learning, it) }
    val radar = SkillsRadar.radarModel(ProfileMath.skillScores(data.skills, data.today))
    val heat = ProfileMath.heatMap(data.today, data.activity)
    val records = ProfileMath.personalRecords(data)
    private val mine = data.courses.firstOrNull { it.course == data.course }
    val level = ProfileMath.levelProgress(
        mine?.cefrLevel ?: "A1",
        content.bundle(course).units.filter { it.level == (mine?.cefrLevel ?: "A1") }.map { u -> u.lessons.map { it.id } },
        data.completions.filter { it.language == data.course }.map { it.lessonId }.toSet(),
    )
    val weak = ProfileMath.weakSpots(data.weakItems)
    val hector = ProfileMath.hectorCard(isPro, data.weakItems, data.weaknessEvents)
    private val unlocked = data.achievements.filter { it.unlockedAt != null }.map { it.id }.toSet()
    val unlockedCount = unlocked.size
    val catalogCount = content.achievements.size
    val next = ProfileMath.nextAchievement(ProfileMath.achievementStats(data), unlocked, content.achievements)
    val league = ProfileMath.leagueStatus(mine?.leagueTier ?: "bronze", big.courseXp)
    /** How far through the current league tier's XP span the learner is, 0 to 100. */
    val leaguePct = ProfileMath.leaguePct(mine?.leagueTier ?: "bronze", big.courseXp)
    /** The latest unlocked achievements (up to three), newest first, for the preview's overlapping medallions. */
    val recentAchievements: List<Achievement> = data.achievements.filter { it.unlockedAt != null }
        .sortedByDescending { it.unlockedAt }
        .mapNotNull { row -> content.achievements.firstOrNull { it.id == row.id } }
        .take(3)
    val name: String = data.displayName?.takeIf { it.isNotEmpty() } ?: "Learner"
    val friends = ProfileMath.friendsWeek(data.friends, name, data.avatarSeed ?: "0", ProfileMath.rollingWeekXp(data.today, data.activity))
    val hasAnyActivity get() = big.lessonsDone > 0 || big.courseXp > 0
}

private val Course.label: String
    get() = when (this) { Course.ENGLISH -> "English"; Course.FRENCH -> "French"; Course.SPANISH -> "Spanish" }

private fun plural(n: Int, one: String, many: String) = if (n == 1) one else many
private val DisplayXLType by lazy { AlphonsoTokens.Type.displayXL.toTextStyle() }
private val NumeralXLType by lazy { AlphonsoTokens.Type.numeralXL.toTextStyle() }
private val NumeralMType by lazy { AlphonsoTokens.Type.numeral.toTextStyle() }

private val LocalFolded = androidx.compose.runtime.compositionLocalOf { false }

@Composable
private fun ProfileCard(title: String?, content: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    if (LocalFolded.current) {
        // Inside a Progress fold the fold is the card: no second border, and the fold's header is the title.
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) { content() }
        return
    }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Column(
        Modifier.fillMaxWidth().cardShadow(shape).clip(shape).background(ds.card).border(1.dp, ds.line, shape).padding(AlphonsoTokens.Space.s4),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        if (title != null) Text(title, style = OverlineType, color = ds.inkSoft, modifier = Modifier.semantics { heading() })
        content()
    }
}

/**
 * The identity hero (the web's ProfileIdentityHero): the learner's picture in a level ring, their name and drawn flag,
 * a league chip, the level bar and the four numbers. It stays on every tab; Progress and Social show it without the
 * level bar and numbers. Every value comes from the overview through [ProfileMath].
 */
@Composable
fun ProfileHero(m: ProfileOverviewModel, compact: Boolean, onPicture: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.sheet)
    val stacked = LocalDensity.current.fontScale >= 1.3f
    Column(
        Modifier.fillMaxWidth().cardShadow(shape).clip(shape).background(Brush.linearGradient(listOf(ds.heroA, ds.heroB)))
            .padding(AlphonsoTokens.Space.s4),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s4),
    ) {
        if (stacked) {
            Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                HeroAvatar(m, onPicture)
                HeroIdentity(m, Modifier.fillMaxWidth())
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s4)) {
                HeroAvatar(m, onPicture)
                HeroIdentity(m, Modifier.weight(1f))
            }
        }
        if (!compact) {
            HeroLevelBar(m)
            HeroNumbers(m, stacked)
        }
    }
}

/** The shared resting shadow of Profile's cards (the mock's resting elevation). */
private fun Modifier.cardShadow(shape: androidx.compose.ui.graphics.Shape): Modifier =
    shadow(AlphonsoTokens.Space.s1, shape, clip = false, ambientColor = AlphonsoTokens.Elevation.shadowTint, spotColor = AlphonsoTokens.Elevation.shadowTint)

/** The picture in a gold ring that fills with this level's lesson progress, a level badge on its corner. */
@Composable
private fun HeroAvatar(m: ProfileOverviewModel, onPicture: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val level = m.level
    val ring = AlphonsoTokens.Space.s12 + AlphonsoTokens.Space.s6 + AlphonsoTokens.Space.s1
    Box(
        Modifier.size(ring).clickable(role = Role.Button, onClickLabel = "Change picture", onClick = onPicture)
            .semantics(mergeDescendants = true) {
                contentDescription = "Change picture"
                stateDescription = "${level.level}, ${level.pct} percent of the level done"
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = AlphonsoTokens.Space.s1.toPx()
            val inset = stroke / 2
            val arc = Size(size.width - stroke, size.height - stroke)
            drawArc(ds.onHero.copy(alpha = 0.18f), 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
            drawArc(
                Brush.linearGradient(listOf(ds.actionHi, ds.action)), -90f, 360f * level.pct.coerceIn(0, 100) / 100f, false,
                Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round),
            )
        }
        ProfileAvatar(m.data.avatarSeed, m.name, ring - AlphonsoTokens.Space.s3)
        Text(
            level.level, style = OverlineType, color = ds.onAction,
            modifier = Modifier.align(Alignment.BottomEnd).clip(CircleShape)
                .background(Brush.verticalGradient(listOf(ds.actionHi, ds.action)))
                .border(2.dp, ds.heroB, CircleShape).padding(horizontal = AlphonsoTokens.Space.s2),
        )
    }
}

@Composable
private fun HeroIdentity(m: ProfileOverviewModel, modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    val label = "${LeagueTierCopy.label(m.league.tier)} league"
    val chip = m.data.league?.let { "$label · Rank ${it.rank}" } ?: label
    Column(modifier, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            Text(m.name, style = DisplayXLType, color = ds.onHero, modifier = Modifier.weight(1f, fill = false).semantics { heading() })
            m.data.country?.takeIf { ProfileMath.flagEmoji(it) != null }?.let { ProfileFlag(it) }
        }
        Row(
            Modifier.clip(CircleShape).background(ds.onHeroKick.copy(alpha = 0.22f))
                .border(1.dp, ds.onHeroKick.copy(alpha = 0.5f), CircleShape)
                .padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s1)
                .clearAndSetSemantics { contentDescription = chip },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
        ) {
            Icon(painterResource(R.drawable.ds_trophy), null, tint = ds.onHeroKick, modifier = Modifier.size(AlphonsoTokens.Space.s4))
            Text(chip, style = CaptionType, color = ds.onHeroKick)
        }
    }
}

/** The learner's flag, drawn (res/drawable/flag_<cc>.xml); a country with no drawing shows its code in a chip, never the emoji. */
@Composable
private fun ProfileFlag(country: String) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val code = ProfileMath.drawnFlagCode(country)
    val res = remember(code) { code?.let { context.resources.getIdentifier("flag_${it.lowercase()}", "drawable", context.packageName) }?.takeIf { it != 0 } }
    val name = remember(country) {
        java.util.Locale.Builder().setRegion(country.uppercase()).build().getDisplayCountry(java.util.Locale.getDefault())
            .ifBlank { "Country ${country.uppercase()}" }
    }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.key / 4)
    if (res != null) {
        Image(
            painterResource(res), contentDescription = name, contentScale = ContentScale.Crop,
            modifier = Modifier.size(AlphonsoTokens.Space.s6, AlphonsoTokens.Space.s4).clip(shape).border(1.dp, ds.onHero.copy(alpha = 0.4f), shape),
        )
    } else {
        Box(
            Modifier.defaultMinSize(minWidth = AlphonsoTokens.Space.s6).height(AlphonsoTokens.Space.s4).clip(shape).background(ds.card)
                .border(1.dp, ds.line, shape).padding(horizontal = AlphonsoTokens.Space.s1).semantics { contentDescription = name },
            contentAlignment = Alignment.Center,
        ) { Text(country.uppercase(), style = CaptionType.copy(fontWeight = FontWeight.Bold), color = ds.ink) }
    }
}

/** A gold bar filling to a percentage on a track. Static: no fill animation to turn off for Reduce Motion. */
@Composable
private fun GoldBar(pct: Int, track: Color, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    Box(modifier.fillMaxWidth().height(AlphonsoTokens.Space.s2).clip(CircleShape).background(track)) {
        Box(
            Modifier.fillMaxHeight().fillMaxWidth(pct.coerceIn(0, 100) / 100f).clip(CircleShape)
                .background(Brush.horizontalGradient(listOf(ds.actionHi, ds.action))),
        )
    }
}

private fun levelLine(m: ProfileOverviewModel): String {
    val left = ProfileMath.lessonsLeft(m.level)
    return when {
        left > 0 -> "$left ${plural(left, "lesson", "lessons")} left in ${m.level.level}"
        m.level.next != null -> "${m.level.level} done. Ready for ${m.level.next}"
        else -> "The top level in ${m.course.label}"
    }
}

@Composable
private fun HeroLevelBar(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    val line = levelLine(m)
    Column(
        Modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = "Level ${m.level.level}, ${m.level.pct} percent, $line"
        },
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            Text("Level ${m.level.level}", style = HeadlineType, color = ds.onHero)
            Text(line, style = CaptionType, color = ds.onHeroSoft, textAlign = androidx.compose.ui.text.style.TextAlign.End, modifier = Modifier.weight(1f))
        }
        GoldBar(m.level.pct, ds.heroB.copy(alpha = 0.4f))
    }
}

private class HeroStatSpec(@androidx.annotation.DrawableRes val icon: Int, val tone: Color, val value: String, val label: String, val spoken: String)

@Composable
private fun HeroNumbers(m: ProfileOverviewModel, stacked: Boolean) {
    val ds = LocalAlphonsoTokens.current
    val b = m.big
    // The same displayed streak as the Learn header (StreakDisplay), with the same protected wording.
    val streakSpoken = if (b.streakState == StreakDisplay.State.PROTECTED) {
        StreakDisplay.accessibilityLabel(StreakDisplay.Shown(b.streak, b.streakState))
    } else "${b.streak} day streak"
    val tiles = listOf(
        HeroStatSpec(R.drawable.ds_flame_solid, ds.onHeroKick, b.streak.toString(), "day streak", streakSpoken),
        HeroStatSpec(R.drawable.ds_bolt_solid, ds.onHeroKick, b.courseXp.toString(), "XP in ${m.course.label}", "${b.courseXp} XP in ${m.course.label}"),
        HeroStatSpec(
            R.drawable.ds_words, ds.onHeroSoft, b.wordsLearned.toString(), plural(b.wordsLearned, "word learned", "words learned"),
            "${b.wordsLearned} ${plural(b.wordsLearned, "word", "words")} learned",
        ),
        HeroStatSpec(
            R.drawable.ds_target, ds.onHeroSoft, b.accuracyPct?.let { "$it%" } ?: "–", "accuracy",
            b.accuracyPct?.let { "$it percent accuracy" } ?: "No accuracy yet",
        ),
    )
    val panel = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Column(
        Modifier.fillMaxWidth().clip(panel).background(ds.heroB.copy(alpha = 0.3f)).border(1.dp, ds.onHero.copy(alpha = 0.1f), panel)
            .padding(AlphonsoTokens.Space.s3),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        if (stacked) tiles.forEach { HeroStat(it, Modifier.fillMaxWidth()) }
        else tiles.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                pair.forEach { HeroStat(it, Modifier.weight(1f)) }
            }
        }
    }
}

/** One number: a line icon in a subtle tile, the value and its label, read by TalkBack as one phrase. */
@Composable
private fun HeroStat(s: HeroStatSpec, modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    Row(
        modifier.clearAndSetSemantics { contentDescription = s.spoken },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        Box(
            Modifier.size(AlphonsoTokens.Space.s8).clip(RoundedCornerShape(AlphonsoTokens.Radius.key)).background(ds.onHero.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center,
        ) { Icon(painterResource(s.icon), null, tint = s.tone, modifier = Modifier.size(AlphonsoTokens.Space.s5)) }
        Column {
            Text(s.value, style = NumeralMType, color = ds.onHero)
            Text(s.label, style = OverlineType, color = ds.onHeroSoft)
        }
    }
}

/** The course switch, right under the hero on Overview: the same app-wide switch as Learn's. */
@Composable
fun ProfileCoursePicker(m: ProfileOverviewModel, onCourse: (Course) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        Course.entries.forEach { c ->
            val on = c == m.course
            Box(
                Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape)
                    .background(if (on) ds.choice else ds.card)
                    .border(1.dp, if (on) ds.choice else ds.line, shape)
                    .selectable(selected = on, role = Role.Tab, onClick = { onCourse(c) })
                    .semantics { contentDescription = c.label + if (on) ", selected" else "" },
                contentAlignment = Alignment.Center,
            ) { Text(c.label, style = HeadlineType, color = if (on) ds.onChoice else ds.brand) }
        }
    }
}

@Composable
fun ProfileWeekSection(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    val locale = LocalConfiguration.current.locales[0]
    val strip = m.strip
    val b = m.big
    ProfileCard("This week") {
        val protected = b.streakState == StreakDisplay.State.PROTECTED
        val chip = if (protected) StreakDisplay.PROTECTED_CAPTION else "${b.streak}-day streak"
        Row(
            Modifier.clip(CircleShape).background(ds.flameTint)
                .padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s1)
                .clearAndSetSemantics { contentDescription = if (protected) chip else "${b.streak} day streak" },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
        ) {
            Icon(painterResource(R.drawable.ds_flame_solid), null, tint = ds.flame, modifier = Modifier.size(AlphonsoTokens.Space.s4))
            Text(chip, style = CaptionType, color = ds.flame)
        }
        val pip = RoundedCornerShape(AlphonsoTokens.Radius.key)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            strip.days.forEach { d ->
                val dow = java.time.LocalDate.parse(d.day).dayOfWeek
                Column(
                    Modifier.weight(1f).clearAndSetSemantics {
                        contentDescription = dow.getDisplayName(java.time.format.TextStyle.FULL, locale) + ": " + d.spoken
                    },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
                ) {
                    // Done days are stamped gold with a check, today is ringed in the choice colour, the rest are plain.
                    val base = Modifier.fillMaxWidth().height(AlphonsoTokens.Space.s8).clip(pip)
                    when (d.state) {
                        ProfileMath.RingState.DONE -> Box(base.background(Brush.verticalGradient(listOf(ds.actionHi, ds.action))), contentAlignment = Alignment.Center) {
                            Icon(painterResource(R.drawable.ds_check), null, tint = ds.onAction, modifier = Modifier.size(AlphonsoTokens.Space.s4))
                        }
                        ProfileMath.RingState.TODAY -> Box(base.background(ds.choiceTint).border(2.dp, ds.choice, pip))
                        else -> Box(base.background(ds.sunk))
                    }
                    Text(
                        dow.getDisplayName(java.time.format.TextStyle.NARROW, locale), style = OverlineType,
                        color = if (d.state == ProfileMath.RingState.DONE) ds.actionText else ds.inkFaint,
                    )
                }
            }
        }
        Text("${strip.doneDays} of 7 days ${if (strip.measuredInMinutes) "goal met" else "active"}", style = FootnoteType, color = ds.inkSoft)
        Text(
            m.dailyGoalMinutes?.let { "Goal: $it learning minutes a day" }
                ?: "Pick a daily time in Edit your answers to measure your days in minutes.",
            style = CaptionType, color = ds.inkSoft,
        )
        if (strip.minutesSpoken > 0) {
            Text("${strip.minutesSpoken} ${plural(strip.minutesSpoken, "minute", "minutes")} spoken this week", style = CaptionType, color = ds.inkSoft)
        }
    }
}

/** The achievements preview: the latest medallions overlapping on navy, how many are unlocked, a chevron to the wall. */
@Composable
fun ProfileAchievementsPreview(m: ProfileOverviewModel, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    val more = m.unlockedCount - m.recentAchievements.size
    val count = "${m.unlockedCount} of ${m.catalogCount} unlocked"
    Row(
        Modifier.fillMaxWidth().cardShadow(shape).clip(shape).background(Brush.linearGradient(listOf(ds.heroA, ds.heroB)))
            .clickable(role = Role.Button, onClick = onClick).heightIn(min = AlphonsoTokens.Space.minTouch)
            .padding(AlphonsoTokens.Space.s3).semantics(mergeDescendants = true) { contentDescription = "Achievements, $count" },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(-AlphonsoTokens.Space.s4)) {
            m.recentAchievements.forEach { Medallion(it.id, AchievementPresentation.State.UNLOCKED, 1f, AlphonsoTokens.Space.s12) }
            if (m.recentAchievements.isEmpty()) m.next?.let { (a, _) -> Medallion(a.id, AchievementPresentation.State.LOCKED, 0f, AlphonsoTokens.Space.s12) }
            if (more > 0) {
                Box(
                    Modifier.padding(start = AlphonsoTokens.Space.s4).size(AlphonsoTokens.Space.s8 + AlphonsoTokens.Space.s2).clip(CircleShape)
                        .background(ds.onHero.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center,
                ) { Text("+$more", style = CaptionType, color = ds.onHero) }
            }
        }
        Column(Modifier.weight(1f)) {
            Text("Achievements", style = HeadlineType, color = ds.onHero)
            Text(count, style = CaptionType, color = ds.onHeroSoft)
        }
        Icon(painterResource(R.drawable.ds_chevron), null, tint = ds.onHeroSoft, modifier = Modifier.size(AlphonsoTokens.Space.s4))
    }
}

/** A tappable row card with a drawn icon in a tinted tile (Edit your answers, Settings, League, Friends, Invite). */
@Composable
fun ProfileRowCard(title: String, subtitle: String, @androidx.annotation.DrawableRes icon: Int, tint: Color, ink: Color, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control + AlphonsoTokens.Space.s1)
    Row(
        Modifier.fillMaxWidth().cardShadow(shape).clip(shape).background(ds.card).border(1.dp, ds.line, shape)
            .clickable(role = Role.Button, onClick = onClick).heightIn(min = AlphonsoTokens.Space.minTouch)
            .padding(AlphonsoTokens.Space.s3).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Box(
            Modifier.size(AlphonsoTokens.Space.s12 - AlphonsoTokens.Space.s2).clip(RoundedCornerShape(AlphonsoTokens.Radius.key + AlphonsoTokens.Space.s1)).background(tint),
            contentAlignment = Alignment.Center,
        ) { Icon(painterResource(icon), null, tint = ink, modifier = Modifier.size(AlphonsoTokens.Space.s5)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = HeadlineType, color = ds.ink)
            Text(subtitle, style = CaptionType, color = ds.inkSoft)
        }
        Icon(painterResource(R.drawable.ds_chevron), null, tint = ds.inkFaint, modifier = Modifier.size(AlphonsoTokens.Space.s4))
    }
}

/** The three tabs (round 6.1): the selected one is filled with the choice colour on a card-coloured track. */
@Composable
fun ProfileTabBar(tab: ProfileTab, onChange: (ProfileTab) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val track = RoundedCornerShape(AlphonsoTokens.Radius.control)
    val pill = RoundedCornerShape(AlphonsoTokens.Radius.control - AlphonsoTokens.Space.s1)
    Row(
        Modifier.fillMaxWidth().cardShadow(track).clip(track).background(ds.card).border(1.dp, ds.line, track).padding(AlphonsoTokens.Space.s1)
            .semantics { contentDescription = "Profile sections" },
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        ProfileTabs.tabs.forEach { t ->
            val on = t == tab
            Box(
                Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.minTouch).clip(pill)
                    .background(if (on) ds.choice else Color.Transparent)
                    .selectable(selected = on, role = Role.Tab, onClick = { onChange(t) }),
                contentAlignment = Alignment.Center,
            ) { Text(t.label, style = FootnoteType, color = if (on) ds.onChoice else ds.inkSoft, maxLines = 1) }
        }
    }
}

/** A Progress card that shows a one-line summary and opens in place. Closed by default. */
@Composable
fun ProfileFold(title: String, summary: String, content: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    var open by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Column(Modifier.fillMaxWidth().cardShadow(shape).clip(shape).background(ds.card).border(1.dp, ds.line, shape)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.s12)
                .clickable(role = Role.Button, onClick = { open = !open })
                .semantics(mergeDescendants = true) {
                    contentDescription = "$title, $summary"
                    stateDescription = if (open) "Expanded" else "Collapsed"
                }
                .padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            Text(title, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
            Text(summary, style = CaptionType, color = ds.inkSoft)
            Text(if (open) "▾" else "▸", style = CaptionType, color = ds.inkSoft)
        }
        if (open) {
            Column(Modifier.fillMaxWidth().padding(start = AlphonsoTokens.Space.s4, end = AlphonsoTokens.Space.s4, bottom = AlphonsoTokens.Space.s4)) {
                androidx.compose.runtime.CompositionLocalProvider(LocalFolded provides true) { content() }
            }
        }
    }
}

/**
 * The Skills radar (web SkillsChart): the right share of recent answers per skill. A skill with too few answers has no
 * vertex and says how many more it needs; with too little data overall the card shows the empty state.
 */
@Composable
fun ProfileSkills(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    val radar = m.radar
    ProfileCard("Skills") {
        if (radar.ready) {
            val n = radar.skills.size
            val spoken = "Skills: " + radar.skills.joinToString(", ") { "${it.label} ${it.pct?.toString() ?: "not scored yet"}" }
            val gridColor = ds.line
            val shapeColor = ds.choice
            val dotColor = ds.xp
            Canvas(Modifier.fillMaxWidth().aspectRatio(1f).clearAndSetSemantics { contentDescription = spoken }) {
                val c = size.width / 2
                val r = c - AlphonsoTokens.Space.s4.toPx()
                val hair = AlphonsoTokens.Space.s1.toPx() / 2
                fun pt(i: Int, rad: Double) = SkillsRadar.radarPoint(i, n, rad, c.toDouble()).let { Offset(it.first.toFloat(), it.second.toFloat()) }
                for (k in 1..4) {
                    val path = Path()
                    for (i in 0 until n) pt(i, r * k / 4.0).let { if (i == 0) path.moveTo(it.x, it.y) else path.lineTo(it.x, it.y) }
                    path.close()
                    drawPath(path, gridColor, style = Stroke(hair))
                }
                for (i in 0 until n) drawLine(gridColor, Offset(c, c), pt(i, r.toDouble()), hair)
                val verts = SkillsRadar.radarPolygon(radar.skills, r.toDouble(), c.toDouble()).map { Offset(it.first.toFloat(), it.second.toFloat()) }
                val shape = Path()
                verts.forEachIndexed { i, o -> if (i == 0) shape.moveTo(o.x, o.y) else shape.lineTo(o.x, o.y) }
                shape.close()
                drawPath(shape, shapeColor, alpha = shapeColor.alpha / 4f)
                drawPath(shape, shapeColor, style = Stroke(AlphonsoTokens.Space.s1.toPx(), join = StrokeJoin.Round))
                verts.forEach { drawCircle(dotColor, AlphonsoTokens.Space.s1.toPx(), it) }
            }
            radar.skills.forEach { s ->
                Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(s.label, style = FootnoteType, color = ds.ink)
                    Text(s.pct?.toString() ?: "not yet", style = FootnoteType, color = ds.inkSoft)
                }
            }
            radar.lowest?.let {
                Text("Lowest: ${it.label} \u00B7 ${it.pct}. Practise it to lift your shape.", style = FootnoteType, color = ds.ink)
            }
        } else {
            Text(
                SkillsRadar.emptyIntro(radar.skills),
                style = FootnoteType, color = ds.inkSoft,
            )
            radar.skills.forEach { s ->
                Text(
                    if (s.pct == null) "${s.label}: ${s.needed} more ${plural(s.needed, "answer", "answers")} to score (${s.answered} of ${SkillsRadar.MIN_SKILL_ANSWERS} so far)"
                    else "${s.label}: ${s.pct}",
                    style = CaptionType, color = ds.inkSoft,
                )
            }
        }
    }
}

@Composable
fun ProfileHeatMap(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    val heat = m.heat
    ProfileCard("Last 3 months") {
        Row(
            Modifier.fillMaxWidth().clearAndSetSemantics {
                contentDescription = "Activity over the last 3 months: ${heat.activeDays} active ${plural(heat.activeDays, "day", "days")}"
            },
            horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
        ) {
            heat.weeks.forEach { week ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                    week.forEach { cell ->
                        val color = when {
                            !cell.inRange -> Color.Transparent
                            cell.level == 0 -> ds.sunk
                            else -> ds.action.copy(alpha = cell.level / 4f)
                        }
                        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(2.dp)).background(color))
                    }
                }
            }
        }
        Text(
            if (heat.activeDays == 0) "No active days yet. Your first lesson lights up the first square."
            else "${heat.activeDays} active ${plural(heat.activeDays, "day", "days")}",
            style = FootnoteType, color = ds.inkSoft,
        )
    }
}

@Composable
fun ProfileRecords(m: ProfileOverviewModel) {
    ProfileCard("Personal records") {
        Record("Best day", "${m.records.bestDayXp} XP")
        Record("Longest streak", "${m.records.bestStreak} ${plural(m.records.bestStreak, "day", "days")}")
        Record("Perfect lessons", m.records.perfectLessons.toString())
    }
}

@Composable
fun ProfileLevel(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    val lv = m.level
    ProfileCard("Level ${lv.level}") {
        LinearProgressIndicator(
            progress = { if (lv.total == 0) 0f else lv.done.toFloat() / lv.total }, color = ds.action, trackColor = ds.sunk,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Level ${lv.level} progress, ${lv.pct} percent" },
        )
        Text(
            if (lv.total == 0) "No lessons at this level yet."
            else "${lv.done} of ${lv.total} lessons done" + (lv.next?.let { ", ${lv.unitsLeft} ${plural(lv.unitsLeft, "unit", "units")} to $it" } ?: ""),
            style = FootnoteType, color = ds.inkSoft,
        )
    }
}

@Composable
private fun Record(label: String, value: String) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = BodyType, color = ds.ink)
        Text(value, style = HeadlineType, color = ds.brand)
    }
}

@Composable
fun ProfileWeak(m: ProfileOverviewModel, onPractice: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    ProfileCard("Top weak spots") {
        val (top, total) = m.weak
        if (top.isEmpty()) {
            Text("Nothing is slipping. Words you miss will show up here.", style = FootnoteType, color = ds.inkSoft)
        } else {
            top.forEach { w: ProfileWeakItem ->
                Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(w.display, style = BodyType, color = ds.ink, modifier = Modifier.weight(1f))
                    Text("${w.lapses} ${plural(w.lapses, "miss", "misses")}", style = CaptionType, color = ds.inkSoft)
                }
            }
            if (total > top.size) Text("${total - top.size} more in Review", style = FootnoteType, color = ds.inkSoft)
            LinkButton("Practice", onPractice)
        }
    }
}

@Composable
fun ProfileHector(m: ProfileOverviewModel, onPaywall: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    m.hector?.let { card ->
        ProfileCard("Hector noticed") {
            when (card) {
                is ProfileMath.HectorCard.Pro ->
                    Text("You are working on ${ProfileMath.joinTopics(card.topics)}. Hector keeps it in mind when you talk.", style = BodyType, color = ds.ink)
                is ProfileMath.HectorCard.Teaser -> {
                    Text("Hector can help you with ${ProfileMath.joinTopics(card.topics)}.", style = BodyType, color = ds.ink)
                    LinkButton("See Hector Pro", onPaywall)
                }
            }
        }
    }
}

/**
 * "What Alphonso remembers" on Profile: opens the page. Pro learners see their notes there; a free learner sees it
 * locked, with a teaser made only from their own weak spots (the same rule as "Hector can help").
 */
@Composable
fun ProfileMemory(isPro: Boolean, topics: List<String>, summary: String?, onOpen: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Column(
        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(ds.hero).clickable(role = Role.Button, onClick = onOpen).padding(AlphonsoTokens.Space.s3),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        Text(if (isPro) "What Alphonso remembers  Pro" else "What Alphonso can remember  Pro", style = HeadlineType, color = ds.onHero)
        Text(
            when {
                isPro -> summary?.let { "$it See and edit." } ?: "See and edit the notes he keeps from your calls."
                topics.isEmpty() -> "With Pro, Alphonso keeps notes between calls."
                else -> "He could remember ${ProfileMath.joinTopics(topics)}. See what Pro keeps."
            },
            style = CaptionType, color = ds.onHeroSoft,
        )
    }
}

@Composable
private fun LinkButton(label: String, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Box(Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClick = onClick), contentAlignment = Alignment.CenterStart) {
        Text(label, style = HeadlineType, color = ds.choice)
    }
}

@Composable
fun ProfileAchievements(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    ProfileCard("Achievements") {
        Text("${m.unlockedCount} of ${m.catalogCount} unlocked", style = HeadlineType, color = ds.brand)
        m.next?.let { (a: Achievement, value) ->
            Text("Next: ${a.title}", style = BodyType, color = ds.ink)
            LinearProgressIndicator(
                progress = { (minOf(value, a.threshold).toFloat() / a.threshold) }, color = ds.xp, trackColor = ds.sunk,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "${a.title}: $value of ${a.threshold}" },
            )
            Text(a.description, style = FootnoteType, color = ds.inkSoft)
        }
    }
}

/** Your league, on navy: the tier, how far to the next, and where you stand this week. */
@Composable
fun ProfileLeague(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    val tier = LeagueTierCopy.label(m.league.tier)
    val toNext = m.league.next?.let { "${m.league.xpToNext} XP to ${LeagueTierCopy.label(it)}" } ?: "The top league. Well done."
    val standing = m.data.league?.let { "Rank ${it.rank} of ${it.size} \u00B7 ${ProfileMath.leagueWeekEnds(it.weekEnd, m.data.timeZone)}" }
    Column(
        Modifier.fillMaxWidth().cardShadow(shape).clip(shape).background(Brush.linearGradient(listOf(ds.heroA, ds.heroB)))
            .padding(AlphonsoTokens.Space.s4)
            .semantics(mergeDescendants = true) { contentDescription = "Your league, $tier. $toNext" + (standing?.let { ". $it" } ?: "") },
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        Text("Your league", style = OverlineType, color = ds.onHeroSoft)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            LeagueShield(m.league.tier, Modifier.width(AlphonsoTokens.Space.s12 + AlphonsoTokens.Space.s1))
            Text(tier, style = DisplayXLType, color = ds.onHeroKick)
        }
        GoldBar(m.leaguePct, ds.heroB.copy(alpha = 0.4f))
        Text(toNext, style = FootnoteType, color = ds.onHeroKick)
        standing?.let { Text(it, style = CaptionType, color = ds.onHeroSoft) }
    }
}

/** The league tier's shield, in its own tier colour (the same emblem the web draws). */
@Composable
private fun LeagueShield(tier: String, modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    val color = LeagueTierPalette.color(tier)
    Canvas(modifier.aspectRatio(52f / 58f)) {
        val k = size.width / 52f
        fun Path.p(x: Float, y: Float, first: Boolean = false) = if (first) moveTo(x * k, y * k) else lineTo(x * k, y * k)
        val outer = Path().apply {
            p(26f, 2f, true); p(48f, 10f); p(48f, 28f)
            cubicTo(48f * k, 42f * k, 38f * k, 51f * k, 26f * k, 56f * k)
            cubicTo(14f * k, 51f * k, 4f * k, 42f * k, 4f * k, 28f * k)
            p(4f, 10f); close()
        }
        drawPath(outer, color)
        val inner = Path().apply {
            p(26f, 10f, true); p(40f, 15f); p(40f, 28f)
            cubicTo(40f * k, 37f * k, 34f * k, 43f * k, 26f * k, 46f * k)
            cubicTo(18f * k, 43f * k, 12f * k, 37f * k, 12f * k, 28f * k)
            p(12f, 15f); close()
        }
        drawPath(inner, ds.card.copy(alpha = 0.8f))
        val star = Path().apply {
            p(26f, 18f, true); p(29f, 24f); p(35f, 24.7f); p(30.5f, 28.7f); p(31.7f, 34.7f)
            p(26f, 31.5f); p(20.3f, 34.7f); p(21.5f, 28.7f); p(17f, 24.7f); p(23f, 24f); close()
        }
        drawPath(star, color)
    }
}

@Composable
fun ProfileFriends(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    ProfileCard("Friends this week") {
        if (m.friends.size <= 1) Text("Add friends to see who is learning with you.", style = FootnoteType, color = ds.inkSoft)
        m.friends.forEachIndexed { i, f ->
            Row(
                Modifier.fillMaxWidth().clearAndSetSemantics {
                    contentDescription = "${i + 1}. ${f.displayName}${if (f.isYou) ", you" else ""}, ${f.weekXp} XP this week"
                },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                Text("${i + 1}", style = HeadlineType, color = ds.inkSoft)
                ProfileAvatar(f.avatarSeed, f.displayName, AlphonsoTokens.Space.s8)
                Text(if (f.isYou) "${f.displayName} (you)" else f.displayName, style = BodyType, color = ds.ink, modifier = Modifier.weight(1f))
                Text("${f.weekXp} XP", style = HeadlineType, color = ds.xpText)
            }
        }
    }
}

@Composable
fun ProfileShare(m: ProfileOverviewModel, onShare: () -> Unit) {
    ProfileCard("Share your week") { LinkButton("Share", onShare) }
}

/** Draws the share card natively from real stats: an image only, with no link. */
fun shareProfileCard(context: Context, m: ProfileOverviewModel, ds: AlphonsoTokens.Colors) {
    val lines = ProfileMath.shareCardLines(m.name, m.course.label, m.level.level, m.big.streak, m.week.minutesSpoken, m.big.xpThisWeek)
    val scale = 3f
    val width = (360 * scale).toInt()
    val pad = AlphonsoTokens.Space.s8.value * scale
    fun paint(spec: AlphonsoTokens.TextSpec, color: Color) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color.toArgb(); textSize = spec.size * scale; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val title = paint(AlphonsoTokens.Type.title, ds.onHero)
    val big = paint(AlphonsoTokens.Type.displayXL, ds.onHero)
    val label = paint(AlphonsoTokens.Type.headline, ds.onHeroSoft)
    val kick = paint(AlphonsoTokens.Type.overline, ds.onHeroKick)
    val rowGap = AlphonsoTokens.Space.s4.value * scale
    val height = (pad * 2 + title.textSize * 2 + 3 * (big.textSize + rowGap) + kick.textSize + rowGap * 2).toInt()
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(ds.heroA.toArgb())
    var y = pad + title.textSize
    canvas.drawText(lines[1], pad, y, title)
    y += title.textSize
    canvas.drawText(lines[2], pad, y, label)
    for (i in 0 until 3) {
        y += big.textSize + rowGap
        canvas.drawText(lines[3 + 2 * i], pad, y, big)
        canvas.drawText(lines[4 + 2 * i], pad + big.measureText(lines[3 + 2 * i]) + rowGap, y, label)
    }
    y += kick.textSize + rowGap
    canvas.drawText(lines[0].uppercase(), pad, y, kick)

    val dir = File(context.cacheDir, "share").apply { mkdirs() }
    val file = File(dir, "profile-week.png")
    file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
