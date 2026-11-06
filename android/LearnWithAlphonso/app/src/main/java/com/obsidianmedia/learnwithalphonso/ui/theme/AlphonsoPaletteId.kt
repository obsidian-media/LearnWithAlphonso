package com.obsidianmedia.learnwithalphonso.ui.theme

/**
 * The design system's two palettes (visual round 6, design/tokens.json): Royal navy and gold, the default, and
 * Meadow green. A palette swaps AlphonsoTokens colour values only. Mirrors the web's src/lib/palette.ts and the
 * iOS Kit's DSPaletteID.
 */
enum class AlphonsoPaletteId(val raw: String) {
    ROYAL("royal"),
    MEADOW("meadow");

    companion object {
        val DEFAULT = ROYAL
        fun fromRaw(raw: String?): AlphonsoPaletteId? = entries.firstOrNull { it.raw == raw }

        /** The four retired themes map onto the palettes: Meadow stays Meadow, the other three become Royal. */
        fun forTheme(theme: AlphonsoThemeId): AlphonsoPaletteId = if (theme == AlphonsoThemeId.MEADOW) MEADOW else ROYAL
    }
}
