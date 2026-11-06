package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * A design system type role (AlphonsoTokens.Type) as a Compose TextStyle: the bundled variable face at the role's
 * weight, width and optical size (FontVariation, API 26+), sizes in sp so font scale applies, and tabular figures
 * where digits change. A role marked uppercase is set in capitals by the caller (TextStyle has no text case).
 */
fun AlphonsoTokens.TextSpec.toTextStyle(): TextStyle {
    val axes = buildList {
        add(FontVariation.weight(weight))
        if (role == AlphonsoTokens.FontRole.DISPLAY) {
            add(FontVariation.Setting("wdth", width))
            opsz?.let { add(FontVariation.Setting("opsz", it)) }
        }
    }
    val family = FontFamily(
        Font(role.resId, FontWeight(weight), variationSettings = FontVariation.Settings(*axes.toTypedArray())),
    )
    return TextStyle(
        fontFamily = family,
        fontWeight = FontWeight(weight),
        fontSize = size.sp,
        lineHeight = lineHeight.sp,
        letterSpacing = tracking.em,
        fontFeatureSettings = if (tnum) "tnum" else null,
    )
}
