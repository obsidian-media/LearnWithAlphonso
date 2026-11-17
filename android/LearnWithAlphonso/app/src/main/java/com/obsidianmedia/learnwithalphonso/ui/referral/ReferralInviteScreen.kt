package com.obsidianmedia.learnwithalphonso.ui.referral

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralCopy
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralSummary
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsField
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.delay

/**
 * Profile > Social > "Invite friends": the learner's referral link with a native share sheet and a copy button, how many
 * friends joined, the reward in plain words, and the "monthly invite reward limit reached" state. Mirrors the web's
 * /profile/invite and the iOS ReferralInviteView. Display and claim only: the server decides every reward.
 */
@Composable
fun ReferralInviteScreen(container: AppContainer, onBack: () -> Unit, seededVm: ReferralInviteViewModel? = null) {
    val vm: ReferralInviteViewModel = seededVm ?: viewModel {
        ReferralInviteViewModel(container.progressClient, container.referralStore, container.session.userId, BuildConfig.API_BASE_URL)
    }
    val state by vm.state.collectAsState()
    ReferralInviteContent(
        state = state, onBack = onBack, onRetry = vm::load, onCopied = vm::markCopied, onCopiedDone = vm::clearCopied,
        onEntry = vm::onEntryChange, onClaim = vm::claimEntry,
    )
}

@Composable
internal fun ReferralInviteContent(
    state: ReferralInviteState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onCopied: () -> Unit,
    onCopiedDone: () -> Unit,
    onEntry: (String) -> Unit,
    onClaim: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    LaunchedEffect(state.copied) {
        if (state.copied) {
            delay(2_000)
            onCopiedDone()
        }
    }
    DsSceneScreen(DsScene.PRACTICE) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("Profile", onBack)
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsGlassTitle(ReferralCopy.TITLE, null)

                DsCard {
                    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                        Icon(painterResource(R.drawable.ds_friends), null, tint = ds.xp, modifier = Modifier.size(AlphonsoTokens.Space.s12))
                        Column(Modifier.weight(1f)) {
                            Text("Both of you get a reward", style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
                            Text(ReferralCopy.EXPLAINER, style = FootnoteType, color = ds.inkSoft)
                        }
                    }
                    Text(ReferralCopy.PRO_NOTE, style = CaptionType, color = ds.inkSoft)
                }

                DsCard {
                    DsOverline("Your link")
                    val link = state.link
                    when {
                        state.isLoading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) }
                        link != null -> {
                            SelectionContainer { Text(link, style = FootnoteType, color = ds.ink, modifier = Modifier.testTag("referralLink")) }
                            LessonEdgeButton(if (state.copied) ReferralCopy.COPIED else ReferralCopy.COPY, EdgeVariant.PRIMARY, {
                                copyToClipboard(context, link)
                                onCopied()
                            })
                            LessonEdgeButton(ReferralCopy.SHARE, EdgeVariant.SECONDARY, { shareLink(context, state.shareText ?: link) })
                        }
                        else -> {
                            Text(ReferralCopy.LOAD_ERROR, style = FootnoteType, color = ds.inkSoft)
                            LessonEdgeButton("Try again", EdgeVariant.SECONDARY, onRetry)
                        }
                    }
                }

                state.summary?.let { InvitesCard(it) }

                DsCard {
                    Text(ReferralCopy.ENTER_TITLE, style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
                    Text(ReferralCopy.ENTER_HINT, style = FootnoteType, color = ds.inkSoft)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                        Box(Modifier.weight(1f)) {
                            DsField(
                                state.entry, onEntry, ReferralCopy.ENTER_FIELD,
                                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = ImeAction.Go),
                                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onGo = { onClaim() }),
                            )
                        }
                        DsCompactButton(ReferralCopy.ENTER_BUTTON, onClaim, enabled = state.canClaim)
                    }
                    state.entryMessage?.let {
                        Text(it, style = FootnoteType, color = if (state.entryDone) ds.ink else ds.wrongInk, modifier = Modifier.testTag("referralEntryMessage"))
                    }
                }
            }
        }
    }
}

@Composable
private fun InvitesCard(summary: ReferralSummary) {
    val ds = LocalAlphonsoTokens.current
    DsCard {
        DsOverline("Your invites")
        Text("${summary.completed}", style = TitleType, color = ds.ink, modifier = Modifier.testTag("referralCount"))
        Text(summary.countLine, style = FootnoteType, color = ds.inkSoft)
        if (summary.capReached) {
            Text(ReferralCopy.CAP_REACHED, style = FootnoteType, color = ds.ink, modifier = Modifier.testTag("referralCapReached"))
        } else {
            Text(summary.rewardsLeftLine, style = CaptionType, color = ds.inkSoft)
        }
    }
}

private fun copyToClipboard(context: Context, link: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText(ReferralCopy.TITLE, link))
}

/** The Android share sheet, carrying the invitation line and the link. */
private fun shareLink(context: Context, text: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, ReferralCopy.TITLE)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(send, ReferralCopy.TITLE))
}
