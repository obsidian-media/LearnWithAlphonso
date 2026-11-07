package com.obsidianmedia.learnwithalphonso.core.avatar

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** A layer's place on the square canvas, as fractions of its side. */
data class LayerRect(val x: Double, val y: Double, val w: Double, val h: Double)

/**
 * A character the call can show: his name, the assets folder his art lives in, where his layers go (read from that
 * folder's manifest.json), and his default room. The viseme, plan and state logic does not know which character it is
 * driving. Alphonso and Hector are the kits shipped.
 */
data class CharacterKit(
    val id: String,
    val displayName: String,
    /** The assets folder holding the kit's WebP layers (`avatar` for Alphonso). */
    val assetFolder: String,
    val mouth: LayerRect,
    /**
     * The group that shows his mood (neutral / raised / lowered): Alphonso's eyebrows, Hector's eyes behind his
     * goggles. Its files are `<expressionPrefix>-neutral|raised|lowered.webp`.
     */
    val expression: LayerRect,
    val expressionPrefix: String,
    /** Ears and the glint are optional: a kit without them has no ear twitch or glint. */
    val earLeft: LayerRect?,
    val earRight: LayerRect?,
    val glint: LayerRect?,
    val defaultRoom: CallRoom,
) {
    fun expressionFile(brows: Brows) = "$expressionPrefix-${brows.wire}.webp"

    /** Every layer file the call loads for this kit: ears and the glint only when the manifest places them. */
    fun layerFiles(): List<String> = buildList {
        add(AvatarLayerFiles.BASE)
        if (glint != null) add(AvatarLayerFiles.GLINT_MASK)
        AvatarLayerFiles.mouthShapes.forEach { add(AvatarLayerFiles.mouth(it)!!) }
        Brows.entries.forEach { add(expressionFile(it)) }
        if (earLeft != null && earRight != null) {
            for (side in EarSide.entries) for (t in listOf(false, true)) add(AvatarLayerFiles.ear(side, t))
        }
    }

    companion object {
        /** Builds a kit from its manifest.json. The layer names are the kit format's: mouth-*, brows-*, ear-*, glint-mask. */
        fun fromManifest(
            manifestJson: String, id: String, displayName: String, assetFolder: String, defaultRoom: CallRoom,
            expressionPrefix: String = "brows",
        ): CharacterKit {
            val layers = Json.parseToJsonElement(manifestJson).jsonObject.getValue("layers").jsonObject
            fun rect(name: String): LayerRect? = layers[name]?.jsonObject?.let { o ->
                LayerRect(o.getValue("x").jsonPrimitive.double, o.getValue("y").jsonPrimitive.double, o.getValue("w").jsonPrimitive.double, o.getValue("h").jsonPrimitive.double)
            }
            val left = rect("ear-left-neutral")
            val right = rect("ear-right-neutral")
            val hasEars = left != null && right != null
            return CharacterKit(
                id, displayName, assetFolder, rect("mouth-ah")!!, rect("$expressionPrefix-neutral")!!, expressionPrefix,
                if (hasEars) left else null, if (hasEars) right else null, rect("glint-mask"), defaultRoom,
            )
        }
    }
}

/** The names of a kit's layer files (the kit format), shared by every character. */
object AvatarLayerFiles {
    const val BASE = "base.webp"
    const val GLINT_MASK = "glint-mask.webp"
    val mouthShapes = listOf(Viseme.HALF, Viseme.TALK, Viseme.AH, Viseme.OH, Viseme.EE, Viseme.FV)
    fun mouth(viseme: Viseme): String? = if (viseme == Viseme.CLOSED) null else "mouth-${viseme.wire}.webp"
    fun brows(brows: Brows) = "brows-${brows.wire}.webp"
    fun ear(side: EarSide, twitching: Boolean) = "ear-${if (side == EarSide.LEFT) "left" else "right"}-${if (twitching) "twitch" else "neutral"}.webp"
}

/** "Show Alphonso while practicing": the same key and default as the iOS and web settings. */
object AvatarPreference {
    const val KEY = "showAlphonsoWhilePractising"
    const val DEFAULT = true
}

/** The system animator duration scale at 0 means the person turned animations off: idle motion stops. */
object ReducedMotion {
    fun isReduced(animatorDurationScale: Float): Boolean = animatorDurationScale == 0f
}
