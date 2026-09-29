package com.obsidianmedia.learnwithalphonso.ui.achievements

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Achievement
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.UnlockedAchievement
import com.obsidianmedia.learnwithalphonso.core.net.WeaknessTrendEntry
import com.obsidianmedia.learnwithalphonso.core.net.fetchWeaknessTrend
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.league.ScreenHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AchievementsUiState(
    val isLoading: Boolean = true,
    val unlockedById: Map<String, UnlockedAchievement> = emptyMap(),
    val weaknessTrend: List<WeaknessTrendEntry> = emptyList(),
    val error: String? = null,
)

/** Port of AchievementsView.swift: the unlock fetch may fail while the catalog still shows. */
class AchievementsViewModel(val content: ContentStore, private val client: ProgressSyncClient) : ViewModel() {
    private val _state = MutableStateFlow(AchievementsUiState())
    val state: StateFlow<AchievementsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val unlocked = runCatching { client.fetchUnlockedAchievements() }
            val trend = runCatching { client.fetchWeaknessTrend() }.getOrDefault(emptyList())
            _state.value = AchievementsUiState(
                isLoading = false,
                unlockedById = unlocked.getOrDefault(emptyList()).associateBy { it.achievementId },
                weaknessTrend = trend,
                error = if (unlocked.isFailure) "Couldn't load your unlock status. Showing the full catalog." else null,
            )
        }
    }
}

@Composable
fun AchievementsScreen(container: AppContainer, onBack: () -> Unit) {
    val palette = AlphonsoColor.palette
    val vm: AchievementsViewModel = viewModel { AchievementsViewModel(container.content, container.progressClient) }
    val state by vm.state.collectAsState()
    Column(Modifier.fillMaxSize().background(palette.surface)) {
        ScreenHeader("Achievements", onBack)
        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
            return@Column
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            state.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft) }
            Text("${state.unlockedById.size} of ${vm.content.achievements.size} unlocked", style = MaterialTheme.typography.labelLarge, color = palette.inkSoft)
            vm.content.achievements.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    pair.forEach { a -> AchievementBadge(a, unlocked = state.unlockedById.containsKey(a.id), modifier = Modifier.weight(1f)) }
                    if (pair.size == 1) Box(Modifier.weight(1f))
                }
            }
            if (state.weaknessTrend.isNotEmpty()) WeaknessTrendCard(state.weaknessTrend)
        }
    }
}

@Composable
fun AchievementBadge(achievement: Achievement, unlocked: Boolean, modifier: Modifier = Modifier) {
    val palette = AlphonsoColor.palette
    val tier = when (achievement.tier) { "bronze" -> Color(0xFFB07242); "silver" -> Color(0xFF8A9099); "gold" -> Color(0xFFC4933F); "diamond" -> Color(0xFF4A7F7A); else -> Color(0xFF878787) }
    val glyph = when (achievement.icon) { "flame" -> "🔥"; "bolt" -> "⚡"; "star" -> "⭐"; "check" -> "✓"; "shield" -> "🛡"; "snow" -> "❄"; else -> "●" }
    Column(
        modifier.clip(RoundedCornerShape(AlphonsoRadius.xl)).background(palette.parchment).padding(12.dp).alpha(if (unlocked) 1f else 0.55f),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(if (unlocked) tier else Color(0xFFC7C7C7)), contentAlignment = Alignment.Center) { Text(glyph, fontSize = 20.sp, color = Color.White) }
        Text(achievement.title, style = MaterialTheme.typography.labelLarge, color = palette.ink, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(achievement.description, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun WeaknessTrendCard(entries: List<WeaknessTrendEntry>) {
    val palette = AlphonsoColor.palette
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Weakness trend", style = MaterialTheme.typography.titleLarge, color = palette.ink)
        Text("Grammar gaps we've spotted, and how they're going", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.xl)).background(palette.parchment).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            entries.take(8).forEach { e ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(e.category.replace('-', ' ').replaceFirstChar { it.uppercase() }, color = palette.ink, modifier = Modifier.weight(1f))
                    if (e.openCount > 0) Text("Still working on it", style = MaterialTheme.typography.labelMedium, color = palette.ember, fontWeight = FontWeight.SemiBold)
                    else Text("Mastered (${e.resolvedCount}×)", style = MaterialTheme.typography.labelMedium, color = palette.moss, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
