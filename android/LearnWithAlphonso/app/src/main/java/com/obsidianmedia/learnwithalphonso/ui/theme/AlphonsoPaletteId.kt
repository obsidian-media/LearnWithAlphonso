package com.obsidianmedia.learnwithalphonso.ui.theme

/**
 * The design system's two palettes (visual round 6, design/tokens.json): Royal navy and gold, the default, and
 * Meadow green. A palette swaps AlphonsoTokens colour values only. The palette is the theme (AlphonsoThemeId). Mirrors
 * the web's src/lib/theme.ts and the iOS Kit's DSPaletteID.
 */
enum class AlphonsoPaletteId(val raw: String) {
    ROYAL("royal"),
    MEADOW("meadow");

    companion object {
        val DEFAULT = ROYAL
        fun fromRaw(raw: String?): AlphonsoPaletteId? = entries.firstOrNull { it.raw == raw }

        /** A theme and its palette are the same choice: Royal is Royal, Meadow is Meadow. */
        fun forTheme(theme: AlphonsoThemeId): AlphonsoPaletteId = if (theme == AlphonsoThemeId.MEADOW) MEADOW else ROYAL
    }
}
