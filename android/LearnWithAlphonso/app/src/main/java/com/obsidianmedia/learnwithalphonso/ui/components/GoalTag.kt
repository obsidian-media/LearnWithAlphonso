package com.obsidianmedia.learnwithalphonso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * The small grey pill "For your <goal> goal" with the goal's icon (owner pick C1): on a lesson that has questions
 * written for the learner's goal, and above a question that is showing its goal version. Never a link: the goal is
 * changed in Profile or Build my path.
 */
@Composable
fun GoalTagPill(goal: String, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val glyph = when (goal) {
        "travel" -> "✈"
        "work" -> "💼"
        "school" -> "🎓"
        "family" -> "⌂"
        "exam" -> "✓"
        else -> "★"
    }
    Row(
        modifier.background(ds.sunk, RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("$glyph For your $goal goal", style = CaptionType, color = ds.inkSoft)
    }
}
