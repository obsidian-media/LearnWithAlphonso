package com.obsidianmedia.learnwithalphonso.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/** Port of ProfileHubView.swift: the hub behind the Profile tab. */
@Composable
fun ProfileHubScreen(onOpenLeague: () -> Unit, onOpenFriends: () -> Unit, onOpenAchievements: () -> Unit, onOpenSettings: () -> Unit) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Profile", style = MaterialTheme.typography.headlineMedium, color = palette.ink, modifier = Modifier.padding(bottom = 8.dp))
        AlphonsoRowCard("League", "Leaderboards, teams, and the season ladder", leadingEmoji = "🏆", modifier = Modifier.clickable(onClick = onOpenLeague))
        AlphonsoRowCard("Friends", "Your friends, their activity, and duels", leadingEmoji = "👥", modifier = Modifier.clickable(onClick = onOpenFriends))
        AlphonsoRowCard("Achievements", "Badges earned and weak spots to work on", leadingEmoji = "⭐", modifier = Modifier.clickable(onClick = onOpenAchievements))
        AlphonsoRowCard("Settings", "Theme and account", leadingEmoji = "⚙️", modifier = Modifier.clickable(onClick = onOpenSettings).padding(top = 8.dp))
    }
}
