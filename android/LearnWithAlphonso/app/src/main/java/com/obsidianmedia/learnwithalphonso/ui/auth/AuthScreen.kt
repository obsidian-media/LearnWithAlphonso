package com.obsidianmedia.learnwithalphonso.ui.auth

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.auth.GoogleSignIn
import com.obsidianmedia.learnwithalphonso.core.auth.AuthState
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
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
    val palette = AlphonsoColor.palette
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current

    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var usePassword by remember { mutableStateOf(false) }
    var passwordMode by remember { mutableStateOf(PasswordMode.SIGN_IN) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text("Learn with Alphonso", style = MaterialTheme.typography.displayMedium, color = palette.ink, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 24.dp))
        AlphonsoMascotBanner("Sign in to start learning")

        Column(
            Modifier
                .widthIn(max = 400.dp)
                .clip(RoundedCornerShape(AlphonsoRadius.xl))
                .background(palette.parchment)
                .border(1.dp, palette.hairline, RoundedCornerShape(AlphonsoRadius.xl))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            val awaiting = state as? AuthState.AwaitingCode
            if (awaiting != null) {
                Text("Enter the code sent to ${awaiting.email}", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                AuthField(code, { code = it }, "6-digit code", KeyboardType.Number)
                AlphonsoPrimaryButton("Verify", onClick = { scope.launch { session.verifyCode(code) } }, enabled = code.isNotBlank(), busy = busy)
                TextButton(onClick = { session.backToEmail(); code = "" }) { Text("Use a different email", color = palette.inkSoft) }
            } else {
                AlphonsoSecondaryButton("Continue with Google", busy = busy, onClick = {
                    val url = session.beginGoogleSignIn(BuildConfig.SUPABASE_URL, GoogleSignIn.REDIRECT_URI)
                    (context as? Activity)?.let { GoogleSignIn.launch(it, url) }
                })
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HorizontalDivider(Modifier.weight(1f), color = palette.hairline)
                    Text("or", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                    HorizontalDivider(Modifier.weight(1f), color = palette.hairline)
                }
                AuthField(email, { email = it }, "Email", KeyboardType.Email)
                if (!usePassword) {
                    AlphonsoPrimaryButton("Send code", onClick = { scope.launch { session.requestCode(email) } }, enabled = email.contains("@"), busy = busy)
                    TextButton(onClick = { usePassword = true; session.clearMessages() }) { Text("Use a password instead", color = palette.inkSoft) }
                } else {
                    if (passwordMode == PasswordMode.SIGN_UP) AuthField(displayName, { displayName = it.take(40) }, "Display name", KeyboardType.Text)
                    if (passwordMode != PasswordMode.FORGOT) AuthField(password, { password = it }, "Password", KeyboardType.Password, secret = true)
                    val label = when (passwordMode) { PasswordMode.SIGN_IN -> "Sign in"; PasswordMode.SIGN_UP -> "Create account"; PasswordMode.FORGOT -> "Send reset link" }
                    val ready = email.contains("@") && (passwordMode == PasswordMode.FORGOT || password.length >= 6)
                    AlphonsoPrimaryButton(label, enabled = ready, busy = busy, onClick = {
                        scope.launch {
                            when (passwordMode) {
                                PasswordMode.SIGN_IN -> session.signInWithPassword(email, password)
                                PasswordMode.SIGN_UP -> session.signUpWithPassword(email, password, displayName, "${BuildConfig.API_BASE_URL}/placement")
                                PasswordMode.FORGOT -> session.resetPassword(email, "${BuildConfig.API_BASE_URL}/reset-password")
                            }
                        }
                    })
                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        TextButton(onClick = { passwordMode = if (passwordMode == PasswordMode.SIGN_UP) PasswordMode.SIGN_IN else PasswordMode.SIGN_UP; session.clearMessages() }) {
                            Text(if (passwordMode == PasswordMode.SIGN_UP) "Have an account? Sign in" else "New here? Create account", color = palette.inkSoft)
                        }
                        if (passwordMode == PasswordMode.SIGN_IN) TextButton(onClick = { passwordMode = PasswordMode.FORGOT; session.clearMessages() }) { Text("Forgot?", color = palette.inkSoft) }
                        else if (passwordMode == PasswordMode.FORGOT) TextButton(onClick = { passwordMode = PasswordMode.SIGN_IN }) { Text("Back", color = palette.inkSoft) }
                    }
                    TextButton(onClick = { usePassword = false; session.clearMessages() }) { Text("Use an email code instead", color = palette.inkSoft) }
                }
            }
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            notice?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
        }

        Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
            Text("By continuing you agree to our ", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
            Text("Terms", style = MaterialTheme.typography.labelSmall, color = palette.moss, modifier = Modifier.clickable { uriHandler.openUri("${BuildConfig.API_BASE_URL}/terms") })
            Text(" and ", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
            Text("Privacy Policy", style = MaterialTheme.typography.labelSmall, color = palette.moss, modifier = Modifier.clickable { uriHandler.openUri("${BuildConfig.API_BASE_URL}/privacy") })
        }
    }
}

@Composable
private fun AuthField(value: String, onChange: (String) -> Unit, label: String, keyboard: KeyboardType, secret: Boolean = false) {
    val palette = AlphonsoColor.palette
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard, autoCorrectEnabled = false),
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        shape = RoundedCornerShape(AlphonsoRadius.md),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = palette.surface, unfocusedContainerColor = palette.surface,
            focusedBorderColor = palette.moss, unfocusedBorderColor = palette.hairline,
            focusedTextColor = palette.ink, unfocusedTextColor = palette.ink, cursorColor = palette.moss,
            focusedLabelColor = palette.moss, unfocusedLabelColor = palette.inkSoft,
        ),
    )
}
