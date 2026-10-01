package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.obsidianmedia.learnwithalphonso.R

/** Same seven OFL fonts the iOS app bundles, as variable-font families. */
object AlphonsoFonts {
    private fun variable(resId: Int, vararg weights: Int): FontFamily = FontFamily(
        weights.map { w ->
            Font(resId, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w)))
        },
    )

    val fraunces = variable(R.font.fraunces_variable, 400, 500, 600, 700)
    val geist = variable(R.font.geist_variable, 400, 500, 600, 700)
    val instrumentSans = variable(R.font.instrument_sans_variable, 400, 500, 600, 700)
    val instrumentSerif = FontFamily(Font(R.font.instrument_serif_regular, FontWeight.Normal))
    val newsreader = variable(R.font.newsreader_variable, 400, 500, 600, 700)
    val sourceSans3 = variable(R.font.source_sans3_variable, 400, 500, 600, 700)
    val baloo2 = variable(R.font.baloo2_variable, 400, 500, 600, 700)

    fun family(face: AlphonsoFontFace): FontFamily = when (face) {
        AlphonsoFontFace.FRAUNCES -> fraunces
        AlphonsoFontFace.GEIST -> geist
        AlphonsoFontFace.INSTRUMENT_SERIF -> instrumentSerif
        AlphonsoFontFace.INSTRUMENT_SANS -> instrumentSans
        AlphonsoFontFace.NEWSREADER -> newsreader
        AlphonsoFontFace.SOURCE_SANS3 -> sourceSans3
        AlphonsoFontFace.BALOO2 -> baloo2
    }
}

/** Display font for titles, sans for everything else; sizes mirror AlphonsoFont.swift's scale. */
fun alphonsoTypography(palette: AlphonsoPalette): Typography {
    val display = AlphonsoFonts.family(palette.displayFont)
    val sans = AlphonsoFonts.family(palette.sansFont)
    return Typography(
        displayLarge = TextStyle(fontFamily = display, fontWeight = FontWeight.SemiBold, fontSize = 40.sp, lineHeight = 44.sp),
        displayMedium = TextStyle(fontFamily = display, fontWeight = FontWeight.SemiBold, fontSize = 32.sp, lineHeight = 38.sp),
        headlineLarge = TextStyle(fontFamily = display, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 34.sp),
        headlineMedium = TextStyle(fontFamily = display, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 30.sp),
        headlineSmall = TextStyle(fontFamily = display, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
        titleLarge = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
        titleMedium = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 22.sp),
        titleSmall = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp),
        bodyLarge = TextStyle(fontFamily = sans, fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 24.sp),
        bodyMedium = TextStyle(fontFamily = sans, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 21.sp),
        bodySmall = TextStyle(fontFamily = sans, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp),
        labelLarge = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp),
        labelMedium = TextStyle(fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 16.sp),
        labelSmall = TextStyle(fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp),
    )
}
