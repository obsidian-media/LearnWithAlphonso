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
 * driving. Alphonso is the only kit shipped; Hector's will be another value of this type.
 */
data class CharacterKit(
    val id: String,
    val displayName: String,
    /** The assets folder holding the kit's WebP layers (`avatar` for Alphonso). */
    val assetFolder: String,
    val mouth: LayerRect,
    val brows: LayerRect,
    val earLeft: LayerRect,
    val earRight: LayerRect,
    val glint: LayerRect,
    val defaultRoom: CallRoom,
) {
    companion object {
        /** Builds a kit from its manifest.json. The layer names are the kit format's: mouth-*, brows-*, ear-*, glint-mask. */
        fun fromManifest(manifestJson: String, id: String, displayName: String, assetFolder: String, defaultRoom: CallRoom): CharacterKit {
            val layers = Json.parseToJsonElement(manifestJson).jsonObject.getValue("layers").jsonObject
            fun rect(name: String): LayerRect {
                val o = layers.getValue(name).jsonObject
                return LayerRect(o.getValue("x").jsonPrimitive.double, o.getValue("y").jsonPrimitive.double, o.getValue("w").jsonPrimitive.double, o.getValue("h").jsonPrimitive.double)
            }
            return CharacterKit(id, displayName, assetFolder, rect("mouth-ah"), rect("brows-neutral"), rect("ear-left-neutral"), rect("ear-right-neutral"), rect("glint-mask"), defaultRoom)
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

/** "Show Alphonso while practising": the same key and default as the iOS and web settings. */
object AvatarPreference {
    const val KEY = "showAlphonsoWhilePractising"
    const val DEFAULT = true
}

/** The system animator duration scale at 0 means the person turned animations off: idle motion stops. */
object ReducedMotion {
    fun isReduced(animatorDurationScale: Float): Boolean = animatorDurationScale == 0f
}
