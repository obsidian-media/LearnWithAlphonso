package com.obsidianmedia.learnwithalphonso.ui.lesson

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.URI

/**
 * What AsyncRemoteImage is willing to download. The only remote images the
 * app shows are vocab photos from our own public Supabase bucket (same
 * origin the web app and iOS pin: src/lib/vocab-images/url-policy.ts), so
 * anything else -- http, another host, userinfo tricks -- is refused, and
 * the body is read with a hard cap instead of trusting the server.
 */
internal object RemoteImagePolicy {
    const val ALLOWED_HOST = "qhcjpfbxfcltjbiuknyt.supabase.co"
    const val ALLOWED_PATH_PREFIX = "/storage/v1/object/public/vocab-images/"

    /** Same 512 KiB ceiling the vocab-image pipeline enforces on upload. */
    const val MAX_BYTES = 512 * 1024

    fun isAllowed(url: String): Boolean {
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        return uri.scheme == "https" &&
            uri.rawUserInfo == null &&
            uri.host == ALLOWED_HOST &&
            (uri.port == -1 || uri.port == 443) &&
            uri.rawPath?.startsWith(ALLOWED_PATH_PREFIX) == true
    }

    /** Reads at most [max] bytes; returns null (never a partial image) if the stream is longer. */
    fun readCapped(input: InputStream, max: Int = MAX_BYTES): ByteArray? {
        val out = ByteArrayOutputStream()
        val buf = ByteArray(8 * 1024)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            if (out.size() + n > max) return null
            out.write(buf, 0, n)
        }
        return out.toByteArray()
    }
}
