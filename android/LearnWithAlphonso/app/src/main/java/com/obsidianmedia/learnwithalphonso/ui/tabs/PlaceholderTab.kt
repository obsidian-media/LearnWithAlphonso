package com.obsidianmedia.learnwithalphonso.ui.tabs

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/** Stands in for tabs whose features land in later plans, so navigation is complete now. */
@Composable
fun PlaceholderTab(title: String, message: String) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.headlineMedium, color = AlphonsoColor.palette.ink, textAlign = TextAlign.Center)
        AlphonsoMascotBanner(message)
    }
}
