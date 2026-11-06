package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf

val LocalAlphonsoPalette = staticCompositionLocalOf<AlphonsoPalette> { AlphonsoPalettes.light.getValue(AlphonsoThemeId.DEFAULT) }

/** The active palette, for screens that need a token Material 3 has no slot for (ember, parchment, hairline). */
object AlphonsoColor {
    val palette: AlphonsoPalette
        @Composable get() = LocalAlphonsoPalette.current
}

private fun colorSchemeFor(p: AlphonsoPalette): ColorScheme {
    val base = if (p.isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = p.moss,
        onPrimary = p.onPrimary,
        primaryContainer = p.mossDeep,
        onPrimaryContainer = p.onMossGradient,
        secondary = p.ember,
        onSecondary = p.onAccent,
        secondaryContainer = p.emberSoft,
        onSecondaryContainer = p.ink,
        tertiary = p.mossDeep,
        background = p.surface,
        onBackground = p.ink,
        surface = p.surface,
        onSurface = p.ink,
        surfaceVariant = p.parchment,
        onSurfaceVariant = p.inkSoft,
        surfaceContainer = p.parchment,
        surfaceContainerLow = p.parchment,
        surfaceContainerHigh = p.parchment,
        outline = p.hairline,
        outlineVariant = p.hairline,
        error = p.destructive,
    )
}

/** The round-6 design system colours (AlphonsoTokens) for the chosen palette, light or night. */
val LocalAlphonsoTokens = staticCompositionLocalOf { AlphonsoTokens.royalLight }

@Composable
fun AlphonsoTheme(
    themeId: AlphonsoThemeId,
    systemDark: Boolean,
    paletteId: AlphonsoPaletteId = AlphonsoPaletteId.forTheme(themeId),
    content: @Composable () -> Unit,
) {
    val palette = AlphonsoPalettes.resolve(themeId, systemDark)
    CompositionLocalProvider(
        LocalAlphonsoPalette provides palette,
        LocalAlphonsoTokens provides AlphonsoTokens.colors(paletteId, systemDark),
    ) {
        MaterialTheme(colorScheme = colorSchemeFor(palette), typography = alphonsoTypography(palette), content = content)
    }
}
