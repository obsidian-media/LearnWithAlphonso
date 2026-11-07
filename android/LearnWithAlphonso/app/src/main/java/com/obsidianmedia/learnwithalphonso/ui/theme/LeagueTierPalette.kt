package com.obsidianmedia.learnwithalphonso.ui.learn

// Lives under ui/theme so the raw tier colours stay in a token file; the package is unchanged for its callers.
object LeagueTierPalette {
    fun color(tier: String): androidx.compose.ui.graphics.Color = when (tier) {
        "bronze" -> androidx.compose.ui.graphics.Color(0xFFB07242)
        "silver" -> androidx.compose.ui.graphics.Color(0xFF8A9099)
        "sapphire" -> androidx.compose.ui.graphics.Color(0xFF4A6B8A)
        "ruby" -> androidx.compose.ui.graphics.Color(0xFF9A4A4A)
        "diamond" -> androidx.compose.ui.graphics.Color(0xFF4A7F7A)
        else -> androidx.compose.ui.graphics.Color(0xFF878787)
    }
}
