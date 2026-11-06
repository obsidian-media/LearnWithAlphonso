package com.obsidianmedia.learnwithalphonso.ui.practice.call

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarIdleMotion
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarIdleScheduler
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarLayerFiles
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarLipSync
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarMachine
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarMode
import com.obsidianmedia.learnwithalphonso.core.avatar.Brows
import com.obsidianmedia.learnwithalphonso.core.avatar.CharacterKit
import com.obsidianmedia.learnwithalphonso.core.avatar.EarSide
import com.obsidianmedia.learnwithalphonso.core.avatar.LayerRect
import com.obsidianmedia.learnwithalphonso.core.avatar.LipSyncPlan
import com.obsidianmedia.learnwithalphonso.core.avatar.ReplyVerdict
import com.obsidianmedia.learnwithalphonso.core.avatar.SeededRandom
import com.obsidianmedia.learnwithalphonso.core.avatar.SpeechPosition
import com.obsidianmedia.learnwithalphonso.core.avatar.Viseme
import com.obsidianmedia.learnwithalphonso.core.avatar.VoicePhase
import com.obsidianmedia.learnwithalphonso.core.content.Course
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** Decodes a WebP from the app's assets. Null when the file is missing: the layer is simply not drawn. */
internal fun loadAsset(context: Context, path: String): ImageBitmap? =
    runCatching { context.assets.open(path).use { BitmapFactory.decodeStream(it) }?.asImageBitmap() }.getOrNull()

/** The whole kit, decoded once off the main thread. Empty until it is ready. */
@Composable
internal fun rememberKitArt(kit: CharacterKit): Map<String, ImageBitmap> {
    val context = LocalContext.current
    val art by produceState<Map<String, ImageBitmap>>(emptyMap(), kit.assetFolder) {
        value = withContext(Dispatchers.Default) {
            buildList {
                add(AvatarLayerFiles.BASE)
                if (kit.glint != null) add(AvatarLayerFiles.GLINT_MASK)
                AvatarLayerFiles.mouthShapes.forEach { add(AvatarLayerFiles.mouth(it)!!) }
                Brows.entries.forEach { add(kit.expressionFile(it)) }
                if (kit.earLeft != null && kit.earRight != null) {
                    for (side in EarSide.entries) for (t in listOf(false, true)) add(AvatarLayerFiles.ear(side, t))
                }
            }.mapNotNull { file -> loadAsset(context, "${kit.assetFolder}/$file")?.let { file to it } }.toMap()
        }
    }
    return art
}

/** Everything one frame needs. */
private data class AvatarFrame(
    val mouth: Viseme = Viseme.CLOSED,
    val brows: Brows = Brows.NEUTRAL,
    val earLeftTwitch: Boolean = false,
    val earRightTwitch: Boolean = false,
    val glint: Double? = null,
    val sway: Float = 0f,
    val breathX: Float = 1f,
    val breathY: Float = 1f,
)

/** Luminance to alpha: the glint mask is white where the lenses are. */
private val luminanceToAlpha = ColorFilter.colorMatrix(
    ColorMatrix(
        floatArrayOf(
            0f, 0f, 0f, 0f, 255f,
            0f, 0f, 0f, 0f, 255f,
            0f, 0f, 0f, 0f, 255f,
            0.2126f, 0.7152f, 0.0722f, 0f, 0f,
        ),
    ),
)

/**
 * The talking 2D character in the full-screen call. The logic (mouth shapes, timing, state, idle life) is the core
 * avatar package, a port of the iOS Kit; this composable only draws it. Pass `Modifier.clearAndSetSemantics {}` from
 * the caller: it is decorative and hidden from TalkBack. The voice never moves the head: only mouth and brows change.
 *
 * Reduce motion (system animations off) stills breathing, sway, ears and glint; mouth and brows still change.
 */
@Composable
internal fun CharacterAvatar(
    kit: CharacterKit,
    phase: () -> VoicePhase,
    replyText: () -> String?,
    /** (position, duration) in seconds while a reply plays, null otherwise. */
    clock: () -> Pair<Double, Double>?,
    /** Numbered so one reply is reacted to once. */
    verdict: () -> Pair<Int, ReplyVerdict>,
    course: Course,
    reducedMotion: Boolean,
    onMode: (AvatarMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    val art = rememberKitArt(kit)
    val phaseNow by rememberUpdatedState(phase)
    val textNow by rememberUpdatedState(replyText)
    val clockNow by rememberUpdatedState(clock)
    val verdictNow by rememberUpdatedState(verdict)
    val onModeNow by rememberUpdatedState(onMode)
    val reducedNow by rememberUpdatedState(reducedMotion)
    var frame by remember { mutableStateOf(AvatarFrame()) }

    LaunchedEffect(kit, course) {
        val machine = AvatarMachine()
        val idle = AvatarIdleScheduler(SeededRandom((System.nanoTime() and 0x7FFFFFFF).toULong()))
        // A verdict that was already there when the stage appeared belongs to a turn that is over.
        var handled = verdictNow().first
        var plan: Pair<String, LipSyncPlan>? = null
        var lastMode = AvatarMode.IDLE
        val origin = System.nanoTime()
        var last = -1.0
        while (true) {
            withFrameNanos { }
            val t = (System.nanoTime() - origin) / 1e9
            if (t - last < 1.0 / 30 - 0.002) continue
            last = t
            val (serial, v) = verdictNow()
            if (serial != handled) {
                handled = serial
                // He reacts once the reply has been spoken; the machine holds the reaction until then.
                machine.replyArrived(v)
            }
            machine.update(phaseNow(), t)
            if (machine.mode != lastMode) { lastMode = machine.mode; onModeNow(lastMode) }

            var speech: SpeechPosition? = null
            val text = textNow()
            val c = clockNow()
            if (machine.mode == AvatarMode.SPEAKING && text != null && c != null && c.second > 0) {
                val key = "${c.second}|$text"
                if (plan?.first != key) plan = key to AvatarLipSync.plan(text, course, c.second)
                speech = SpeechPosition(plan!!.second, c.first)
            }
            val pose = machine.pose(t, speech)
            val still = reducedNow
            if (!still) idle.advance(t)
            val breath = AvatarIdleMotion.breathScale(t)
            val next = AvatarFrame(
                mouth = pose.mouth,
                brows = pose.brows,
                earLeftTwitch = !still && idle.twitchingEar == EarSide.LEFT,
                earRightTwitch = !still && idle.twitchingEar == EarSide.RIGHT,
                glint = if (still) null else idle.glintProgress,
                sway = if (still) 0f else AvatarIdleMotion.swayDegrees(t).toFloat(),
                breathX = if (still) 1f else breath.first.toFloat(),
                breathY = if (still) 1f else breath.second.toFloat(),
            )
            if (next != frame) frame = next
        }
    }

    Canvas(modifier) {
        val f = frame
        val side = size.width
        withTransform({
            rotate(f.sway, pivot = Offset(side / 2, side))
            scale(f.breathX, f.breathY, pivot = Offset(side / 2, side))
        }) {
            layer(art[AvatarLayerFiles.BASE], LayerRect(0.0, 0.0, 1.0, 1.0))
            kit.earLeft?.let { layer(art[AvatarLayerFiles.ear(EarSide.LEFT, f.earLeftTwitch)], it) }
            kit.earRight?.let { layer(art[AvatarLayerFiles.ear(EarSide.RIGHT, f.earRightTwitch)], it) }
            AvatarLayerFiles.mouth(f.mouth)?.let { layer(art[it], kit.mouth) }
            layer(art[kit.expressionFile(f.brows)], kit.expression)
            kit.glint?.let { rect -> f.glint?.let { glint(art[AvatarLayerFiles.GLINT_MASK], rect, it) } }
        }
    }
}

private fun DrawScope.layer(image: ImageBitmap?, rect: LayerRect) {
    image ?: return
    drawImage(
        image,
        dstOffset = IntOffset((size.width * rect.x).roundToInt(), (size.height * rect.y).roundToInt()),
        dstSize = IntSize((size.width * rect.w).roundToInt().coerceAtLeast(1), (size.height * rect.h).roundToInt().coerceAtLeast(1)),
    )
}

/** A soft diagonal band of light across the lenses; the mask (white = lens) keeps it off the rest. */
private fun DrawScope.glint(mask: ImageBitmap?, rect: LayerRect, progress: Double) {
    mask ?: return
    val x = size.width * rect.x.toFloat()
    val y = size.height * rect.y.toFloat()
    val w = size.width * rect.w.toFloat()
    val h = size.height * rect.h.toFloat()
    drawIntoCanvas { canvas ->
        canvas.saveLayer(androidx.compose.ui.geometry.Rect(x, y, x + w, y + h), Paint())
        val bandW = w * 0.4f
        val cx = x + w / 2 + (progress.toFloat() - 0.5f) * w * 1.6f
        rotate(20f, pivot = Offset(cx, y + h / 2)) {
            drawRect(
                Brush.horizontalGradient(
                    listOf(Color.White.copy(alpha = 0f), Color.White.copy(alpha = 0.65f), Color.White.copy(alpha = 0f)),
                    startX = cx - bandW / 2, endX = cx + bandW / 2,
                ),
                topLeft = Offset(cx - bandW / 2, y - h * 0.7f), size = Size(bandW, h * 2.4f),
            )
        }
        drawImage(
            mask,
            dstOffset = IntOffset(x.roundToInt(), y.roundToInt()), dstSize = IntSize(w.roundToInt().coerceAtLeast(1), h.roundToInt().coerceAtLeast(1)),
            colorFilter = luminanceToAlpha, blendMode = BlendMode.DstIn,
        )
        canvas.restore()
    }
}
