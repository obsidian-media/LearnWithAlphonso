package com.obsidianmedia.learnwithalphonso

import com.obsidianmedia.learnwithalphonso.ui.lesson.RemoteImagePolicy
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

class RemoteImagePolicyTest {
    private val good =
        "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/apple.jpg?v=0123abcd"

    @Test
    fun `accepts a vocab image from our bucket`() {
        assertTrue(RemoteImagePolicy.isAllowed(good))
    }

    @Test
    fun `refuses plain http`() {
        assertFalse(RemoteImagePolicy.isAllowed(good.replace("https://", "http://")))
    }

    @Test
    fun `refuses other hosts, lookalikes and userinfo tricks`() {
        assertFalse(RemoteImagePolicy.isAllowed("https://evil.example/storage/v1/object/public/vocab-images/en/a.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("https://qhcjpfbxfcltjbiuknyt.supabase.co.evil.example/storage/v1/object/public/vocab-images/a.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("https://qhcjpfbxfcltjbiuknyt.supabase.co@evil.example/storage/v1/object/public/vocab-images/a.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("https://user:pw@qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/a.jpg"))
    }

    @Test
    fun `refuses other paths on our host and other schemes`() {
        assertFalse(RemoteImagePolicy.isAllowed("https://qhcjpfbxfcltjbiuknyt.supabase.co/rest/v1/profiles"))
        assertFalse(RemoteImagePolicy.isAllowed("file:///data/data/app/secret.jpg"))
        assertFalse(RemoteImagePolicy.isAllowed("content://media/external/images/1"))
        assertFalse(RemoteImagePolicy.isAllowed("not a url"))
        assertFalse(RemoteImagePolicy.isAllowed(""))
    }

    @Test
    fun `readCapped returns the bytes when under the cap and exactly at it`() {
        val data = ByteArray(100) { it.toByte() }
        assertArrayEquals(data, RemoteImagePolicy.readCapped(ByteArrayInputStream(data), 100))
        assertNotNull(RemoteImagePolicy.readCapped(ByteArrayInputStream(data), 1000))
    }

    @Test
    fun `readCapped refuses a body one byte over the cap instead of truncating`() {
        assertNull(RemoteImagePolicy.readCapped(ByteArrayInputStream(ByteArray(101)), 100))
        assertNull(RemoteImagePolicy.readCapped(ByteArrayInputStream(ByteArray(RemoteImagePolicy.MAX_BYTES + 1))))
    }
}
