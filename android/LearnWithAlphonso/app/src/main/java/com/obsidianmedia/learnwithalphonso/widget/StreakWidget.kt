package com.obsidianmedia.learnwithalphonso.widget

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.logic.STREAK_WIDGET_PREFS
import com.obsidianmedia.learnwithalphonso.core.logic.STREAK_WIDGET_SNAPSHOT_KEY
import com.obsidianmedia.learnwithalphonso.core.logic.StreakWidgetCopy
import com.obsidianmedia.learnwithalphonso.core.logic.StreakWidgetLayout
import com.obsidianmedia.learnwithalphonso.core.logic.StreakWidgetLook
import com.obsidianmedia.learnwithalphonso.core.logic.StreakWidgetSnapshot
import com.obsidianmedia.learnwithalphonso.core.logic.makeStreakWidgetSnapshot
import com.obsidianmedia.learnwithalphonso.core.logic.resolveStreakWidgetLook
import com.obsidianmedia.learnwithalphonso.core.logic.streakNumberScale
import com.obsidianmedia.learnwithalphonso.core.logic.streakWidgetFamilyForWidth
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens

/** Port of WidgetProgressPublisher.swift: the one place progress crosses into the widget's preferences. */
object WidgetPublisher {
    fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(STREAK_WIDGET_PREFS, Context.MODE_PRIVATE)

    /** Writes the snapshot; pure enough for a JVM test through MemoryPrefs. [theme] is the app's stored theme ("royal" or "meadow"). */
    fun write(prefs: SharedPreferences, progress: LessonCompletionProgress, nowMillis: Long = System.currentTimeMillis(), theme: String? = null): StreakWidgetSnapshot {
        val snapshot = makeStreakWidgetSnapshot(progress.streak, progress.longestStreak, progress.lastActiveDate, nowMillis, theme = theme)
        prefs.edit().putString(STREAK_WIDGET_SNAPSHOT_KEY, ContentJson.json.encodeToString(StreakWidgetSnapshot.serializer(), snapshot)).apply()
        return snapshot
    }

    fun read(prefs: SharedPreferences): StreakWidgetSnapshot? =
        prefs.getString(STREAK_WIDGET_SNAPSHOT_KEY, null)?.let { runCatching { ContentJson.json.decodeFromString(StreakWidgetSnapshot.serializer(), it) }.getOrNull() }

    /**
     * The learner changed theme: rewrites the published snapshot with the new theme, numbers untouched. Returns
     * whether there was a snapshot to rewrite; with none (signed out) the next publish carries the theme.
     */
    fun writeTheme(prefs: SharedPreferences, theme: String): Boolean {
        val stored = read(prefs) ?: return false
        prefs.edit().putString(STREAK_WIDGET_SNAPSHOT_KEY, ContentJson.json.encodeToString(StreakWidgetSnapshot.serializer(), stored.withTheme(theme))).apply()
        return true
    }

    /** Forgets the snapshot, so the next account never sees the previous account's streak. */
    fun clear(prefs: SharedPreferences) {
        prefs.edit().remove(STREAK_WIDGET_SNAPSHOT_KEY).apply()
    }

    suspend fun clear(context: Context) {
        clear(prefs(context))
        runCatching { StreakWidget().updateAll(context) }
    }

    suspend fun publish(context: Context, progress: LessonCompletionProgress, theme: String? = null) {
        write(prefs(context), progress, theme = theme)
        runCatching { StreakWidget().updateAll(context) }
    }

    suspend fun republishTheme(context: Context, theme: String) {
        if (writeTheme(prefs(context), theme)) runCatching { StreakWidget().updateAll(context) }
    }
}

/** The design system colours the widget draws, by look: Royal light, Royal night, Meadow (light only). */
internal fun streakWidgetColors(look: StreakWidgetLook): AlphonsoTokens.Colors = when (look) {
    StreakWidgetLook.ROYAL_LIGHT -> AlphonsoTokens.royalLight
    StreakWidgetLook.ROYAL_NIGHT -> AlphonsoTokens.royalNight
    StreakWidgetLook.MEADOW_LIGHT -> AlphonsoTokens.meadowLight
}

/**
 * One colour role as a day/night pair. The pair comes from resolveStreakWidgetLook for a light and a dark system, so
 * Royal swaps to its night colour when the system is dark and Meadow's two halves are the same light colour: Meadow
 * stays light, even in dark mode. On Android 12 and later the system picks the half itself, with no redraw.
 */
private fun pair(theme: String?, role: (AlphonsoTokens.Colors) -> Color): ColorProvider {
    val (day, night) = streakWidgetColorPair(theme, role)
    return ColorProvider(day = day, night = night)
}

/** A colour role's (day, night) halves for a theme; tested directly, since the ColorProvider cannot be read back. */
internal fun streakWidgetColorPair(theme: String?, role: (AlphonsoTokens.Colors) -> Color): Pair<Color, Color> =
    role(streakWidgetColors(resolveStreakWidgetLook(theme, systemDark = false))) to
        role(streakWidgetColors(resolveStreakWidgetLook(theme, systemDark = true)))

private fun glanceWeight(weight: Int): FontWeight = if (weight >= 700) FontWeight.Bold else if (weight >= 500) FontWeight.Medium else FontWeight.Normal

private fun textStyle(spec: AlphonsoTokens.TextSpec, color: ColorProvider, align: TextAlign? = null, scale: Float = 1f): TextStyle =
    TextStyle(color = color, fontSize = (spec.size * scale).sp, fontWeight = glanceWeight(spec.weight), textAlign = align)

/** The pose is 0.47 as wide as it is tall (210 x 450 px). */
private const val ALPHONSO_ASPECT = 210f / 450f

/**
 * The streak widget in the round-6 design system, on Glance: a 2x2 face (the streak, its caption, whether you studied
 * today) that becomes a 4x2 face with the best streak and Alphonso when resized wide. Real data only. Port of
 * StreakWidgetView.swift. Glance cannot load the bundled variable fonts, so text uses the system face at the design
 * system sizes and weights.
 */
class StreakWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetPublisher.read(WidgetPublisher.prefs(context))
        provideContent { Content(snapshot) }
    }

    @Composable
    private fun Content(snapshot: StreakWidgetSnapshot?) {
        val theme = snapshot?.theme
        val size = LocalSize.current
        val layout = StreakWidgetLayout.resolve(streakWidgetFamilyForWidth(size.width.value), hasSnapshot = snapshot != null)
        val surface = pair(theme) { it.surface }
        val root = GlanceModifier.fillMaxSize().background(surface).cornerRadius(AlphonsoTokens.Radius.control)
        if (snapshot == null) {
            Empty(root, theme)
        } else {
            Face(root, snapshot, layout, theme, size.height.value)
        }
    }

    @Composable
    private fun Empty(root: GlanceModifier, theme: String?) {
        Column(
            modifier = root.padding(AlphonsoTokens.Space.s3),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(ImageProvider(R.drawable.widget_fire), contentDescription = null, modifier = GlanceModifier.size(EMPTY_FLAME))
            Spacer(GlanceModifier.height(AlphonsoTokens.Space.s2))
            Text(
                StreakWidgetCopy.EMPTY,
                modifier = GlanceModifier.fillMaxWidth(),
                style = textStyle(AlphonsoTokens.Type.footnote, pair(theme) { it.ink }, TextAlign.Center),
            )
        }
    }

    @Composable
    private fun Face(root: GlanceModifier, snapshot: StreakWidgetSnapshot, layout: StreakWidgetLayout, theme: String?, heightDp: Float) {
        val ink = pair(theme) { it.ink }
        val soft = pair(theme) { it.inkSoft }
        Row(modifier = root, verticalAlignment = Alignment.Bottom) {
            Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight().padding(AlphonsoTokens.Space.s3)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(ImageProvider(R.drawable.widget_fire), contentDescription = null, modifier = GlanceModifier.size(FLAME))
                    Spacer(GlanceModifier.width(AlphonsoTokens.Space.s2))
                    Text("${snapshot.streak}", maxLines = 1, style = textStyle(AlphonsoTokens.Type.displayXL, ink, scale = streakNumberScale(snapshot.streak)))
                }
                Text(StreakWidgetCopy.caption(snapshot.streak), style = textStyle(AlphonsoTokens.Type.footnote, soft))
                if (layout.showsBest) {
                    Spacer(GlanceModifier.height(AlphonsoTokens.Space.s1))
                    Text(StreakWidgetCopy.best(snapshot.streak, snapshot.longestStreak), style = textStyle(AlphonsoTokens.Type.caption, soft))
                }
                Spacer(GlanceModifier.defaultWeight())
                StatusChip(snapshot.studiedToday, theme)
            }
            if (layout.showsAlphonso) {
                val imageHeight = (heightDp - AlphonsoTokens.Space.s4.value).dp
                Box(modifier = GlanceModifier.fillMaxHeight().padding(end = AlphonsoTokens.Space.s2), contentAlignment = Alignment.BottomEnd) {
                    Image(
                        ImageProvider(R.drawable.widget_alphonso_streak_flame),
                        // Decorative: the streak, caption and chip beside it say everything the pose does.
                        contentDescription = null,
                        modifier = GlanceModifier.height(imageHeight).width((imageHeight.value * ALPHONSO_ASPECT).dp),
                        contentScale = ContentScale.Fit,
                    )
                }
            }
        }
    }

    @Composable
    private fun StatusChip(studiedToday: Boolean, theme: String?) {
        val face = if (studiedToday) pair(theme) { it.rightTint } else pair(theme) { it.actionTint }
        val text = if (studiedToday) pair(theme) { it.rightInk } else pair(theme) { it.actionText }
        Row(
            modifier = GlanceModifier.background(face).cornerRadius(AlphonsoTokens.Radius.key).padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                ImageProvider(if (studiedToday) R.drawable.ds_check else R.drawable.widget_status_circle),
                contentDescription = null,
                modifier = GlanceModifier.size(CHIP_ICON),
                colorFilter = ColorFilter.tint(text),
            )
            Spacer(GlanceModifier.width(AlphonsoTokens.Space.s1))
            Text(
                if (studiedToday) StreakWidgetCopy.STUDIED_TODAY else StreakWidgetCopy.NOT_STUDIED_YET,
                style = textStyle(AlphonsoTokens.Type.caption, text),
            )
        }
    }

    private companion object {
        val FLAME = 34.dp
        val EMPTY_FLAME = 44.dp
        val CHIP_ICON = 13.dp
    }
}

class StreakWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = StreakWidget()
}
