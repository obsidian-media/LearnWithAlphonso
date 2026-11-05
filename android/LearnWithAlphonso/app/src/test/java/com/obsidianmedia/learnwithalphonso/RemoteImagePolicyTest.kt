package com.obsidianmedia.learnwithalphonso

import com.obsidianmedia.learnwithalphonso.ui.lesson.RemoteImagePolicy
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File

/** Pins what AsyncRemoteImage may download: our vocab-images bucket only, with a capped body. */
class RemoteImagePolicyTest {
    private val good =
        "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/apple.jpg?v=0123abcd"

    /** The real URL shape from content/vocab-images.json loads. */
    @Test
    fun `accepts a vocab image from our bucket`() {
        assertTrue(RemoteImagePolicy.isAllowed(good))
        assertTrue(RemoteImagePolicy.isAllowed(good.replace(".co/", ".co:443/")))
    }

    /** Every image the app actually ships a reference to must pass, or it silently never renders. */
    @Test
    fun `every bundled vocab image url is allowed`() {
        val urls = testContent.vocabImages.values.map { it.url }
        assertTrue(urls.size > 100)
        urls.forEach { assertTrue(it, RemoteImagePolicy.isAllowed(it)) }
    }

    /** Cleartext is refused. */
    @Test
    fun `refuses plain http`() {
        assertFalse(RemoteImagePolicy.isAllowed(good.replace("https://", "http://")))
    }

    /** Only the exact host, with no userinfo, passes. */
    @Test
    fun `refuses other hosts, lookalikes and userinfo tricks`() {
        assertFalse(RemoteImagePolicy.isAllowed("https://evil.example/storage/v1/object/public/vocab-images/en/a.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("https://qhcjpfbxfcltjbiuknyt.supabase.co.evil.example/storage/v1/object/public/vocab-images/a.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("https://qhcjpfbxfcltjbiuknyt.supabase.co@evil.example/storage/v1/object/public/vocab-images/a.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("https://user:pw@qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/a.jpg"))
    }

    /** A non-default port on the right host is a different service. */
    @Test
    fun `refuses a non-default port`() {
        assertFalse(RemoteImagePolicy.isAllowed(good.replace(".co/", ".co:8443/")))
    }

    /** Other paths on our host, dot segments out of the bucket, and non-https schemes are refused. */
    @Test
    fun `refuses other paths on our host and other schemes`() {
        assertFalse(RemoteImagePolicy.isAllowed("https://qhcjpfbxfcltjbiuknyt.supabase.co/rest/v1/profiles"))
        assertFalse(RemoteImagePolicy.isAllowed("https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/../avatars/a.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/%2E%2E/avatars/a.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("file:///data/data/app/secret.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("content://media/external/images/1"))
        assertFalse(RemoteImagePolicy.isAllowed("not a url"))
        assertFalse(RemoteImagePolicy.isAllowed(""))
    }

    /** A body up to the cap is returned whole. */
    @Test
    fun `readCapped returns the bytes when under the cap and exactly at it`() {
        val data = ByteArray(100) { it.toByte() }
        assertArrayEquals(data, RemoteImagePolicy.readCapped(ByteArrayInputStream(data), 100))
        assertNotNull(RemoteImagePolicy.readCapped(ByteArrayInputStream(data), 1000))
    }

    /** A body over the cap is refused, never truncated into a partial image. */
    @Test
    fun `readCapped refuses a body one byte over the cap instead of truncating`() {
        assertNull(RemoteImagePolicy.readCapped(ByteArrayInputStream(ByteArray(101)), 100))
        assertNull(RemoteImagePolicy.readCapped(ByteArrayInputStream(ByteArray(RemoteImagePolicy.MAX_BYTES + 1))))
    }

    /** The composable is a Compose sink with no JVM seam, so pin its wiring by source. */
    @Test
    fun `AsyncRemoteImage checks the policy, refuses redirects and caps the body`() {
        val src = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui/lesson/AsyncRemoteImage.kt").readText()
        assertTrue(src.contains("RemoteImagePolicy.isAllowed(url)"))
        assertTrue(src.contains("instanceFollowRedirects = false"))
        assertTrue(src.contains("RemoteImagePolicy.readCapped("))
        assertFalse(src.contains("decodeStream("))
    }
}
