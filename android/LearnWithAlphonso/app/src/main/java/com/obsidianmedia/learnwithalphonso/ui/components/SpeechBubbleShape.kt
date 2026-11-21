package com.obsidianmedia.learnwithalphonso.ui.components

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * A rounded speech bubble with a small tail pointing out its LEADING edge, low down, at Alphonso standing to the left
 * (iOS twin: SpeechBubbleShape's `tailLeading`). The tail's width is carved out of the bubble's own width, so give the
 * content that much extra start padding ([tailWidth]). One outline, so a border does not cross the tail's base.
 * [showsTail] false draws a plain rounded bubble and reserves nothing.
 */
class SpeechBubbleShape(
    private val cornerRadius: Dp,
    val tailWidth: Dp = 14.dp,
    private val tailHeight: Dp = 16.dp,
    private val showsTail: Boolean = true,
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline = with(density) {
        val radius = cornerRadius.toPx()
        val tailW = if (showsTail) tailWidth.toPx() else 0f
        val body = Path().apply {
            addRoundRect(RoundRect(Rect(tailW, 0f, size.width, size.height), CornerRadius(radius)))
        }
        if (!showsTail) return@with Outline.Generic(body)
        val tailH = tailHeight.toPx()
        val midY = size.height - radius - tailH / 2
        val tail = Path().apply {
            // The base sits 1 px inside the body so the union is one piece, not two shapes sharing an edge.
            moveTo(tailW + 1f, midY - tailH / 2)
            lineTo(0f, midY)
            lineTo(tailW + 1f, midY + tailH / 2)
            close()
        }
        Outline.Generic(Path.combine(PathOperation.Union, body, tail))
    }
}
