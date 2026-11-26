package com.obsidianmedia.learnwithalphonso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * The small grey pill "For your <goal> goal" with the goal's icon (owner pick C1): on a lesson that has questions
 * written for the learner's goal, on the Today row, and above a question that is showing its goal version. Never a
 * link: the goal is changed in Profile or Build my path.
 */
@Composable
fun GoalTagPill(goal: String, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val icon = when (goal) {
        "travel" -> R.drawable.goal_travel
        "work" -> R.drawable.goal_work
        "school" -> R.drawable.goal_school
        "family" -> R.drawable.goal_family
        "exam" -> R.drawable.goal_exam
        else -> R.drawable.goal_fun
    }
    Row(
        modifier.background(ds.sunk, RoundedCornerShape(50)).padding(horizontal = AlphonsoTokens.Space.s2, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = ds.inkSoft, modifier = Modifier.size(13.dp))
        Text("For your $goal goal", style = CaptionType, color = ds.inkSoft)
    }
}

/** The learner's goal from their first-run answers, or null while it loads, when skipped, or when it cannot be read. */
@Composable
fun rememberLearnerGoal(container: AppContainer): State<String?> =
    produceState<String?>(initialValue = null, container) {
        value = runCatching { container.learnerProfileClient.fetch().answers.goal }.getOrNull()
    }
