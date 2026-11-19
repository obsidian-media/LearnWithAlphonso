package com.obsidianmedia.learnwithalphonso.ui.listen

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallSplit
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.lazy.items
import com.obsidianmedia.learnwithalphonso.core.podcast.Stories
import com.obsidianmedia.learnwithalphonso.core.podcast.StoriesLibraryLayout
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.StorySummary
import com.obsidianmedia.learnwithalphonso.ui.components.DsEmptyState
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * The Stories library: a featured branching story, a line to resume what you started, then cover cards (the Android twin of
 * StoriesLibrary.tsx and the StoriesViews.swift library). The layout rules are [Stories.library] in core (JVM tests); this
 * file only draws them. A card is one button with its full name ([Stories.cardLabel]); the endings ring is decorative.
 */

private val coverCache = LruCache<String, ImageBitmap>(24)

/** The first scene's art, fetched once per URL; null while loading, when there is none, or when it fails (the fallback shows). */
@Composable
private fun rememberCover(url: String?): ImageBitmap? {
    val bitmap by produceState<ImageBitmap?>(url?.let { coverCache.get(it) }, url) {
        if (url == null) { value = null; return@produceState }
        value = coverCache.get(url) ?: withContext(Dispatchers.IO) { fetchCoverBitmap(url) }?.also { coverCache.put(url, it) }
    }
    return bitmap
}

private fun fetchCoverBitmap(url: String): ImageBitmap? = try {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 10_000
    connection.readTimeout = 10_000
    try {
        if (connection.responseCode in 200..299) connection.inputStream.use { BitmapFactory.decodeStream(it)?.asImageBitmap() } else null
    } finally {
        connection.disconnect()
    }
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    null
}

/** A story's cover: its art, or a designed fallback (brand-to-scene gradient and an icon) so a card is never a broken image. Decorative. */
@Composable
private fun StoryCover(story: StorySummary, emojiSize: Int, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val image = rememberCover(story.coverUrl)
    Box(
        modifier.background(Brush.linearGradient(listOf(ds.heroA, ds.heroB))).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        if (image != null) {
            Image(image, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            Text(if (story.branching) "🧭" else "📚", fontSize = emojiSize.sp)
        }
    }
}

/** The endings-found ring: decorative, the same fact is in the card's name and caption. */
@Composable
private fun EndingsRing(story: StorySummary, size: Dp) {
    val ds = LocalAlphonsoTokens.current
    val fraction = Stories.endingsFraction(story)
    Canvas(Modifier.size(size).testTag("endings-ring").clearAndSetSemantics { }) {
        val stroke = 4.dp.toPx()
        val inset = stroke / 2
        val arc = Size(this.size.width - stroke, this.size.height - stroke)
        drawCircle(Color.Black.copy(alpha = 0.45f))
        drawArc(Color.White.copy(alpha = 0.35f), 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
        drawArc(ds.xp, -90f, 360f * fraction, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
    }
}

/** One cover card: a single button with its full name; [small] is the Library peek's size. */
@Composable
internal fun StoryCoverCard(story: StorySummary, small: Boolean, onOpen: (String) -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier.testTag("story-card-${story.id}").clip(shape).background(ds.card).border(2.dp, ds.line, shape)
            .clickable(role = Role.Button) { onOpen(story.id) }
            .clearAndSetSemantics { contentDescription = Stories.cardLabel(story); role = Role.Button },
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f)) {
            StoryCover(story, if (small) 36 else 52, Modifier.fillMaxSize())
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(0.5f).background(Brush.verticalGradient(listOf(Color.Transparent, ds.hero.copy(alpha = 0.7f)))))
            if (story.branching) {
                Row(
                    Modifier.align(Alignment.TopStart).padding(AlphonsoTokens.Space.s2).background(ds.choice, CircleShape).padding(horizontal = 8.dp, vertical = 2.dp).clearAndSetSemantics { },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(Icons.Filled.CallSplit, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                    Text("Path", color = Color.White, fontWeight = FontWeight.Bold, style = CaptionType)
                }
            }
            if (story.branching && story.endingsTotal > 0) {
                Box(Modifier.align(Alignment.TopEnd).padding(AlphonsoTokens.Space.s2)) { EndingsRing(story, if (small) 30.dp else 36.dp) }
            }
        }
        Column(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s3), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
            Text(
                story.level, color = ds.choice, fontWeight = FontWeight.Bold, style = CaptionType,
                modifier = Modifier.background(ds.choiceTint, RoundedCornerShape(8.dp)).padding(horizontal = 6.dp),
            )
            Text(story.title, color = ds.ink, fontWeight = FontWeight.Bold, style = HeadlineType)
            Text(Stories.caption(story), color = ds.inkSoft, style = CaptionType)
        }
    }
}

/** The featured story: full-width cover with a scrim, the "Choose your path" badge, title, "A2 · N endings · M found" and Read now / Continue. */
@Composable
private fun StoryHeroCard(story: StorySummary, onOpen: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(20.dp)
    val action = if (story.endingsFound > 0) "Continue" else "Read now"
    Box(
        Modifier.testTag("stories-hero").fillMaxWidth().heightIn(min = 224.dp).clip(shape)
            .clickable(role = Role.Button) { onOpen(story.id) }
            .clearAndSetSemantics { contentDescription = "${Stories.cardLabel(story)}, $action"; role = Role.Button },
    ) {
        StoryCover(story, 96, Modifier.matchParentSize())
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Transparent, 0.25f to Color.Transparent, 0.6f to ds.hero.copy(alpha = 0.55f), 1f to ds.hero.copy(alpha = 0.92f))))
        Column(
            Modifier.fillMaxWidth().heightIn(min = 224.dp).padding(AlphonsoTokens.Space.s4),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2, Alignment.Bottom),
        ) {
            Row(
                Modifier.background(ds.choice, CircleShape).padding(horizontal = 10.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(Icons.Filled.CallSplit, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                Text("CHOOSE YOUR PATH", color = Color.White, fontWeight = FontWeight.Bold, style = CaptionType)
            }
            Text(story.title, color = ds.onHero, style = TitleType)
            Text(Stories.heroLine(story), color = ds.onHero, style = FootnoteType)
            Row(
                Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).background(ds.action, CircleShape).padding(start = AlphonsoTokens.Space.s4, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(action, color = ds.onAction, fontWeight = FontWeight.Bold, style = HeadlineType)
                Text("▶", color = ds.onAction, style = CaptionType, modifier = Modifier.size(28.dp).background(ds.onAction.copy(alpha = 0.15f), CircleShape).wrapContentSize())
            }
        }
    }
}

/** The slim resume card under the hero: thumbnail, title, "Continue · Scene X" and Resume. */
@Composable
private fun StoryContinueLine(story: StorySummary, onOpen: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Row(
        Modifier.testTag("stories-continue").fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(ds.card).border(2.dp, ds.line, shape)
            .clickable(role = Role.Button) { onOpen(story.id) }
            .clearAndSetSemantics { contentDescription = "${story.title}, ${Stories.resumeLine(story)}, Resume"; role = Role.Button }
            .padding(AlphonsoTokens.Space.s2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        StoryCover(story, 22, Modifier.size(width = 52.dp, height = 40.dp).clip(RoundedCornerShape(9.dp)))
        Column(Modifier.weight(1f)) {
            Text(story.title, color = ds.ink, fontWeight = FontWeight.Bold, style = HeadlineType)
            Text(Stories.resumeLine(story), color = ds.inkSoft, style = CaptionType)
        }
        Text(
            "Resume", color = Color.White, fontWeight = FontWeight.Bold, style = FootnoteType,
            modifier = Modifier.background(ds.choice, CircleShape).padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s2),
        )
    }
}

/** The library's items: the featured story, the continue line, then the cover grid two across; an empty state when nothing is published. */
fun LazyListScope.storiesLibraryItems(layout: StoriesLibraryLayout, onOpen: (String) -> Unit) {
    if (layout.featured == null && layout.resume == null && layout.grid.isEmpty()) {
        item(key = "stories-empty") { DsEmptyState(StoryCopy.EMPTY_TITLE, StoryCopy.EMPTY_MESSAGE, artAsset = "lesson/happy.webp") }
        return
    }
    layout.featured?.let { story -> item(key = "stories-hero") { StoryHeroCard(story, onOpen) } }
    layout.resume?.let { story -> item(key = "stories-continue") { StoryContinueLine(story, onOpen) } }
    items(layout.grid.chunked(2), key = { row -> "stories-row-${row.first().id}" }) { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            row.forEach { story -> StoryCoverCard(story, small = false, onOpen = onOpen, modifier = Modifier.weight(1f)) }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

/** The whole library as its own scrolling column: the standalone Stories screen and the instrumented test use it. */
@Composable
fun StoriesLibraryContent(stories: List<StorySummary>, courseCode: String, onOpen: (String) -> Unit, modifier: Modifier = Modifier) {
    LazyColumn(
        modifier.testTag("stories-library"),
        contentPadding = PaddingValues(AlphonsoTokens.Space.gutter),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        storiesLibraryItems(Stories.library(stories, courseCode), onOpen)
    }
}

/** A small cover card of the Library's All-tab peek row. */
@Composable
internal fun StoriesPeekCard(story: StorySummary, onOpen: (String) -> Unit) {
    StoryCoverCard(story, small = true, onOpen = onOpen, modifier = Modifier.width(168.dp))
}
