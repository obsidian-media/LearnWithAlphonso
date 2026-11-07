package com.obsidianmedia.learnwithalphonso.ui.auth

import android.app.Activity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.auth.GoogleSignIn
import com.obsidianmedia.learnwithalphonso.core.auth.AuthState
import com.obsidianmedia.learnwithalphonso.core.logic.PasswordPolicy
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import com.obsidianmedia.learnwithalphonso.core.logic.LessonExpression
import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FirstRunBubble
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FirstRunHud
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FirstRunRoom
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FirstRunScreen
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.lessonFace
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.launch

private enum class PasswordMode { SIGN_IN, SIGN_UP, FORGOT }

/** Port of AuthView.swift plus the web's password flows: Google, email code, or password. */
@Composable
fun AuthScreen(container: AppContainer) {
    val session = container.session
    val state by session.state.collectAsState()
    val busy by session.isBusy.collectAsState()
    val error by session.errorMessage.collectAsState()
    val notice by session.notice.collectAsState()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current

    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var usePassword by remember { mutableStateOf(false) }
    var passwordMode by remember { mutableStateOf(PasswordMode.SIGN_IN) }
    // The bot check on the email forms (BotCheckWebView). Google sign-in never needs it.
    val botCheck = remember { BotCheckState() }

    val ds = LocalAlphonsoTokens.current
    val awaitingCode = state is AuthState.AwaitingCode
    val bubbleTitle = if (awaitingCode) "Check your email." else "Welcome back."
    val bubbleSub = if (awaitingCode) "Type the 6-digit code." else "Sign in to start learning."

    // imePadding lifts the content above the keyboard; FirstRunScreen scrolls, so the active controls stay reachable.
    Box(Modifier.fillMaxSize().imePadding()) {
    FirstRunScreen(
        room = {
            FirstRunRoom("room-light", lessonFace(LessonExpression.TALK), "Alphonso") { FirstRunHud(showCounter = false) }
            FirstRunBubble(bubbleTitle, bubbleSub) { FirstRunDevice.speak(context, "$bubbleTitle $bubbleSub") }
        },
        footer = {},
    ) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter).padding(top = AlphonsoTokens.Space.s1),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Column(
            Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
        ) {
            val awaiting = state as? AuthState.AwaitingCode
            if (awaiting != null) {
                Text("Enter the code sent to ${awaiting.email}", style = FootnoteType, color = ds.inkSoft)
                AuthField(code, { code = it }, "6-digit code", KeyboardType.Number)
                LessonEdgeButton("Verify", EdgeVariant.PRIMARY, { scope.launch { session.verifyCode(code) } }, enabled = code.isNotBlank() && !busy)
                TextButton(onClick = { session.backToEmail(); code = "" }) { Text("Use a different email", color = ds.inkSoft) }
            } else {
                LessonEdgeButton("Continue with Google", EdgeVariant.SECONDARY, enabled = !busy, onClick = {
                    val url = session.beginGoogleSignIn(BuildConfig.SUPABASE_URL, GoogleSignIn.REDIRECT_URI)
                    (context as? Activity)?.let { GoogleSignIn.launch(it, url) }
                })
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                    HorizontalDivider(Modifier.weight(1f), color = ds.line)
                    Text("or", style = CaptionType, color = ds.inkSoft)
                    HorizontalDivider(Modifier.weight(1f), color = ds.line)
                }
                AuthField(email, { email = it }, "Email", KeyboardType.Email)
                BotCheckWebView(botCheck, "${BuildConfig.API_BASE_URL}/native-captcha")
                if (!usePassword) {
                    LessonEdgeButton("Send code", EdgeVariant.PRIMARY, { scope.launch { session.requestCode(email, botCheck.spend()) } }, enabled = email.contains("@") && botCheck.canSend && !busy)
                    TextButton(onClick = { usePassword = true; session.clearMessages() }) { Text("Use a password instead", color = ds.inkSoft) }
                } else {
                    if (passwordMode == PasswordMode.SIGN_UP) AuthField(displayName, { displayName = it.take(40) }, "Display name", KeyboardType.Text)
                    if (passwordMode != PasswordMode.FORGOT) AuthField(password, { password = it }, "Password", KeyboardType.Password, secret = true)
                    val label = when (passwordMode) { PasswordMode.SIGN_IN -> "Sign in"; PasswordMode.SIGN_UP -> "Create account"; PasswordMode.FORGOT -> "Send reset link" }
                    val ready = email.contains("@") && when (passwordMode) {
                        PasswordMode.FORGOT -> true
                        PasswordMode.SIGN_UP -> PasswordPolicy.longEnoughToCreate(password)
                        PasswordMode.SIGN_IN -> PasswordPolicy.longEnoughToSignIn(password)
                    }
                    LessonEdgeButton(label, EdgeVariant.PRIMARY, enabled = ready && botCheck.canSend && !busy, onClick = {
                        val token = botCheck.spend()
                        scope.launch {
                            when (passwordMode) {
                                PasswordMode.SIGN_IN -> session.signInWithPassword(email, password, token)
                                PasswordMode.SIGN_UP -> session.signUpWithPassword(email, password, displayName, "${BuildConfig.API_BASE_URL}/placement", token)
                                PasswordMode.FORGOT -> session.resetPassword(email, "${BuildConfig.API_BASE_URL}/reset-password", token)
                            }
                        }
                    })
                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        TextButton(onClick = { passwordMode = if (passwordMode == PasswordMode.SIGN_UP) PasswordMode.SIGN_IN else PasswordMode.SIGN_UP; session.clearMessages() }) {
                            Text(if (passwordMode == PasswordMode.SIGN_UP) "Have an account? Sign in" else "New here? Create account", color = ds.inkSoft)
                        }
                        if (passwordMode == PasswordMode.SIGN_IN) TextButton(onClick = { passwordMode = PasswordMode.FORGOT; session.clearMessages() }) { Text("Forgot?", color = ds.inkSoft) }
                        else if (passwordMode == PasswordMode.FORGOT) TextButton(onClick = { passwordMode = PasswordMode.SIGN_IN }) { Text("Back", color = ds.inkSoft) }
                    }
                    TextButton(onClick = { usePassword = false; session.clearMessages() }) { Text("Use an email code instead", color = ds.inkSoft) }
                }
            }
            error?.let { Text(it, style = FootnoteType, color = ds.wrongInk, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            notice?.let { Text(it, style = FootnoteType, color = ds.ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
        }

        Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
            Text("By continuing you agree to our ", style = CaptionType, color = ds.inkSoft)
            Text("Terms", style = CaptionType, color = ds.brand, modifier = Modifier.clickable { uriHandler.openUri("${BuildConfig.API_BASE_URL}/terms") })
            Text(" and ", style = CaptionType, color = ds.inkSoft)
            Text("Privacy Policy", style = CaptionType, color = ds.brand, modifier = Modifier.clickable { uriHandler.openUri("${BuildConfig.API_BASE_URL}/privacy") })
        }
    }
    }
    }
}

@Composable
private fun AuthField(value: String, onChange: (String) -> Unit, label: String, keyboard: KeyboardType, secret: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    val focusManager = LocalFocusManager.current
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard, autoCorrectEnabled = false, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        shape = RoundedCornerShape(AlphonsoTokens.Radius.control),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = ds.card, unfocusedContainerColor = ds.card,
            focusedBorderColor = ds.brand, unfocusedBorderColor = ds.line,
            focusedTextColor = ds.ink, unfocusedTextColor = ds.ink, cursorColor = ds.brand,
            focusedLabelColor = ds.brand, unfocusedLabelColor = ds.inkSoft,
        ),
    )
}
