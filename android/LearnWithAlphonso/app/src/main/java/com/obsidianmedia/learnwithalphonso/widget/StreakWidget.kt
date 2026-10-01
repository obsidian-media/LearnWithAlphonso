package com.obsidianmedia.learnwithalphonso.widget

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.logic.STREAK_WIDGET_PREFS
import com.obsidianmedia.learnwithalphonso.core.logic.STREAK_WIDGET_SNAPSHOT_KEY
import com.obsidianmedia.learnwithalphonso.core.logic.StreakWidgetSnapshot
import com.obsidianmedia.learnwithalphonso.core.logic.makeStreakWidgetSnapshot
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress

/** Port of WidgetProgressPublisher.swift: the one place progress crosses into the widget's preferences. */
object WidgetPublisher {
    fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(STREAK_WIDGET_PREFS, Context.MODE_PRIVATE)

    /** Writes the snapshot; pure enough for a JVM test through MemoryPrefs. */
    fun write(prefs: SharedPreferences, progress: LessonCompletionProgress, nowMillis: Long = System.currentTimeMillis()): StreakWidgetSnapshot {
        val snapshot = makeStreakWidgetSnapshot(progress.streak, progress.longestStreak, progress.lastActiveDate, nowMillis)
        prefs.edit().putString(STREAK_WIDGET_SNAPSHOT_KEY, ContentJson.json.encodeToString(StreakWidgetSnapshot.serializer(), snapshot)).apply()
        return snapshot
    }

    fun read(prefs: SharedPreferences): StreakWidgetSnapshot? =
        prefs.getString(STREAK_WIDGET_SNAPSHOT_KEY, null)?.let { runCatching { ContentJson.json.decodeFromString(StreakWidgetSnapshot.serializer(), it) }.getOrNull() }

    suspend fun publish(context: Context, progress: LessonCompletionProgress) {
        write(prefs(context), progress)
        runCatching { StreakWidget().updateAll(context) }
    }
}

/** Port of StreakWidgetView.swift in Glance: a streak count and "did you study today". */
class StreakWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetPublisher.read(WidgetPublisher.prefs(context))
        provideContent { GlanceTheme { Content(snapshot) } }
    }

    @Composable
    private fun Content(snapshot: StreakWidgetSnapshot?) {
        val ink = ColorProvider(Color(0xFF1F2A24))
        val soft = ColorProvider(Color(0xFF6B7570))
        val green = ColorProvider(Color(0xFF2E7D4F))
        Column(
            modifier = GlanceModifier.fillMaxSize().background(Color(0xFFFBF7EF)).cornerRadius(16.dp).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (snapshot == null) {
                Text("🔥", style = TextStyle(fontSize = 24.sp))
                Text("Open Learn with Alphonso to start your streak", style = TextStyle(color = soft, fontSize = 11.sp))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("🔥", style = TextStyle(fontSize = 22.sp))
                    Spacer(GlanceModifier.width(4.dp))
                    Text("${snapshot.streak}", style = TextStyle(color = ink, fontSize = 28.sp, fontWeight = FontWeight.Bold))
                }
                Text("day streak", style = TextStyle(color = soft, fontSize = 12.sp))
                Spacer(GlanceModifier.height(6.dp))
                Text(
                    if (snapshot.studiedToday) "✓ Studied today" else "○ Not studied yet",
                    style = TextStyle(color = if (snapshot.studiedToday) green else soft, fontSize = 11.sp),
                )
            }
        }
    }
}

class StreakWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = StreakWidget()
}
