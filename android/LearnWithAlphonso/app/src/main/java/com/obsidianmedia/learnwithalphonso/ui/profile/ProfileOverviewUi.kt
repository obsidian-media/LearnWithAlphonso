package com.obsidianmedia.learnwithalphonso.ui.profile

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.obsidianmedia.learnwithalphonso.core.content.Achievement
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.logic.deriveVocab
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileTab
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileTabs
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileOverviewData
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileWeakItem
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
class ProfileOverviewModel(val data: ProfileOverviewData, content: ContentStore, val course: Course, isPro: Boolean) {
    val big = ProfileMath.bigNumbers(data) { id ->
        content.findLesson(id, course)?.let { (_, lesson) -> deriveVocab(lesson, emptyMap()).map { it.term } } ?: emptyList()
    }
    val week = ProfileMath.weekRings(data.today, data.activity, data.speech)
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
    val name: String = data.displayName?.takeIf { it.isNotEmpty() } ?: "Learner"
    val flag = ProfileMath.flagEmoji(data.country)
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
        Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, ds.line, shape).padding(AlphonsoTokens.Space.s4),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        if (title != null) Text(title, style = OverlineType, color = ds.inkSoft, modifier = Modifier.semantics { heading() })
        content()
    }
}

@Composable
fun ProfileHero(m: ProfileOverviewModel, onCourse: (Course) -> Unit, onPicture: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(Brush.verticalGradient(listOf(ds.heroA, ds.heroB))).padding(AlphonsoTokens.Space.s4),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s4),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s4)) {
            Box(
                Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClickLabel = "Change picture", onClick = onPicture)
                    .semantics { contentDescription = "Change picture" },
            ) { ProfileAvatar(m.data.avatarSeed, m.name, 72.dp) }
            Row(Modifier.weight(1f), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                Text(m.name, style = DisplayXLType, color = ds.onHero, modifier = Modifier.weight(1f, fill = false))
                m.flag?.let { Text(it, style = TitleType, modifier = Modifier.semantics { contentDescription = "Flag" }) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            Course.entries.forEach { c ->
                val on = c == m.course
                Box(
                    Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.minTouch)
                        .clip(RoundedCornerShape(AlphonsoTokens.Radius.control))
                        .background(if (on) ds.onHero else Color.Transparent)
                        .border(2.dp, ds.onHeroSoft, RoundedCornerShape(AlphonsoTokens.Radius.control))
                        .clickable(role = Role.Tab, onClick = { onCourse(c) })
                        .semantics { contentDescription = c.label + if (on) ", selected" else "" },
                    contentAlignment = Alignment.Center,
                ) { Text(c.label, style = HeadlineType, color = if (on) ds.hero else ds.onHero) }
            }
        }
        val b = m.big
        Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s4)) {
            Row(Modifier.fillMaxWidth()) {
                Stat(b.streak.toString(), "day streak", "Longest ${b.longestStreak}", "${b.streak} day streak, longest ${b.longestStreak}", Modifier.weight(1f))
                Stat(b.courseXp.toString(), "XP in ${m.course.label}", "${b.xpThisWeek} this week", "${b.courseXp} XP in ${m.course.label}, ${b.xpThisWeek} this week", Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth()) {
                Stat(b.wordsLearned.toString(), "words learned", "${b.savedWords} saved", "${b.wordsLearned} words learned, ${b.savedWords} saved", Modifier.weight(1f))
                Stat(
                    b.lessonsDone.toString(), plural(b.lessonsDone, "lesson done", "lessons done"),
                    b.accuracyPct?.let { "$it% accuracy" } ?: "No lessons yet",
                    "${b.lessonsDone} lessons done, " + (b.accuracyPct?.let { "$it percent accuracy" } ?: "no lessons yet"),
                    Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun Stat(value: String, label: String, sub: String, spoken: String, modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    Column(modifier.clearAndSetSemantics { contentDescription = spoken }) {
        Text(value, style = NumeralXLType, color = ds.onHero)
        Text(label, style = FootnoteType, color = ds.onHero)
        Text(sub, style = CaptionType, color = ds.onHeroSoft)
    }
}

@Composable
fun ProfileWeekSection(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    val locale = LocalConfiguration.current.locales[0]
    ProfileCard("This week") {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            m.week.days.forEach { d ->
                val dow = java.time.LocalDate.parse(d.day).dayOfWeek
                val word = when (d.state) {
                    ProfileMath.RingState.DONE -> "done"
                    ProfileMath.RingState.TODAY -> "today, not yet"
                    ProfileMath.RingState.MISSED -> "not done"
                    ProfileMath.RingState.FUTURE -> "to come"
                }
                Column(
                    Modifier.weight(1f).clearAndSetSemantics {
                        contentDescription = dow.getDisplayName(java.time.format.TextStyle.FULL, locale) + ": " + word
                    },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
                ) {
                    val ringSize = AlphonsoTokens.Space.s8
                    when (d.state) {
                        ProfileMath.RingState.DONE -> Box(Modifier.size(ringSize).clip(CircleShape).background(ds.flame))
                        ProfileMath.RingState.TODAY -> Box(Modifier.size(ringSize).border(3.dp, ds.flame, CircleShape))
                        else -> Box(Modifier.size(ringSize).border(3.dp, ds.line, CircleShape))
                    }
                    Text(dow.getDisplayName(java.time.format.TextStyle.NARROW, locale), style = CaptionType, color = ds.inkSoft)
                }
            }
        }
        Text("${m.week.activeDays} of 7 days active", style = FootnoteType, color = ds.inkSoft)
    }
    Spacer3()
    ProfileCard("Minutes spoken this week") {
        val mins = m.week.minutesSpoken
        Text(
            mins.toString(), style = NumeralMType, color = ds.brand,
            modifier = Modifier.semantics { contentDescription = "$mins ${plural(mins, "minute", "minutes")} spoken this week" },
        )
        if (mins == 0) Text("Speak in a lesson or with Hector and your minutes show up here.", style = FootnoteType, color = ds.inkSoft)
    }
}

@Composable
private fun Spacer3() = Box(Modifier.size(AlphonsoTokens.Space.s3))

/** The three tabs (round 6.1): selected pill is the card colour on a line-coloured track, like the web's ProfileTabBar. */
@Composable
fun ProfileTabBar(tab: ProfileTab, onChange: (ProfileTab) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val track = RoundedCornerShape(AlphonsoTokens.Radius.pill)
    Row(
        Modifier.fillMaxWidth().clip(track).background(ds.line).padding(AlphonsoTokens.Space.s1)
            .semantics { contentDescription = "Profile sections" },
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        ProfileTabs.tabs.forEach { t ->
            val on = t == tab
            Box(
                Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.s12).clip(track)
                    .background(if (on) ds.card else Color.Transparent)
                    .selectable(selected = on, role = Role.Tab, onClick = { onChange(t) }),
                contentAlignment = Alignment.Center,
            ) { Text(t.label, style = FootnoteType, color = if (on) ds.ink else ds.inkSoft, maxLines = 1) }
        }
    }
}

/** Avatar and name on Progress and Social, where the full hero would push the content off screen. */
@Composable
fun ProfileCompactHeader(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        ProfileAvatar(m.data.avatarSeed, m.name, AlphonsoTokens.Space.s8)
        Text(m.name, style = TitleType, color = ds.ink, modifier = Modifier.weight(1f).semantics { heading() })
    }
}

/** A Progress card that shows a one-line summary and opens in place. Closed by default. */
@Composable
fun ProfileFold(title: String, summary: String, content: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    var open by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Column(Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, ds.line, shape)) {
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

/** Where the Skills radar goes. Its data (per-skill scores) does not exist yet, so this is an honest empty state. */
@Composable
fun ProfileSkillsSlot() {
    ProfileCard("Skills") {
        Text(
            "Your speaking, listening, reading, writing and vocabulary shape will appear here once there is enough practice to show it.",
            style = FootnoteType, color = LocalAlphonsoTokens.current.inkSoft,
        )
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

@Composable
fun ProfileLeague(m: ProfileOverviewModel) {
    val ds = LocalAlphonsoTokens.current
    ProfileCard("League") {
        Text(m.league.tier.replaceFirstChar { it.uppercase() }, style = TitleType, color = ds.brand)
        Text(
            m.league.next?.let { "${m.league.xpToNext} XP to ${it.replaceFirstChar { c -> c.uppercase() }}" } ?: "Top league reached",
            style = FootnoteType, color = ds.inkSoft,
        )
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
