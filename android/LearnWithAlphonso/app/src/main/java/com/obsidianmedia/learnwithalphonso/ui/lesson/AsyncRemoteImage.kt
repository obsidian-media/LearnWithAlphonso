package com.obsidianmedia.learnwithalphonso.ui.lesson

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections

/**
 * A tiny remote-image loader with an in-memory cache, enough for the vocab
 * photos (a few small JPEGs per lesson) without pulling in an image library.
 */
@Composable
fun AsyncRemoteImage(url: String, contentDescription: String?, modifier: Modifier = Modifier) {
    var bitmap by remember(url) { mutableStateOf(cache[url]) }
    LaunchedEffect(url) {
        if (bitmap != null) return@LaunchedEffect
        bitmap = withContext(Dispatchers.IO) {
            runCatching {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 8_000
                connection.readTimeout = 8_000
                connection.inputStream.use { BitmapFactory.decodeStream(it) }?.asImageBitmap()
            }.getOrNull()
        }?.also { cache[url] = it }
    }
    bitmap?.let { Image(it, contentDescription = contentDescription, modifier = modifier, contentScale = ContentScale.Crop) }
}

private val cache: MutableMap<String, ImageBitmap> = Collections.synchronizedMap(
    object : LinkedHashMap<String, ImageBitmap>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ImageBitmap>?): Boolean = size > 48
    },
)
