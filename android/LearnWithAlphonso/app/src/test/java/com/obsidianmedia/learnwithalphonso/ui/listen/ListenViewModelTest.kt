package com.obsidianmedia.learnwithalphonso.ui.listen

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastCacheEntry
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ListenViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun row(id: String, title: String) = """{"id":"$id","folder_id":"f1","slug":"$id","title":"$title","description":null,"audio_path":"en/$id.mp3","duration_seconds":100}"""

    private fun server(offline: Boolean = false) = FakeServer { req ->
        when {
            offline -> json("{}", HttpStatusCode.ServiceUnavailable)
            req.path.endsWith("podcast_folders") -> json("""[{"id":"f1","parent_id":null,"slug":"en","title":"English","description":null,"sort_order":0}]""")
            req.path.endsWith("podcast_episodes") && req.query.containsKey("or") -> json("[${row("s1", "Coffee talk")}]")
            req.path.endsWith("podcast_episodes") -> json("[${row("b", "Bravo")},${row("a", "Alpha")}]")
            else -> json("[]")
        }
    }

    private fun client(s: FakeServer) = PodcastClient(SupabaseHttp("https://x.supabase.co", "pk", { "tok" }, s.engine), { "u1" })
    private fun entry(id: String) = PodcastCacheEntry(id, 10, null, 100, null)

    @Test
    fun `load maps folders and loadEpisodes remembers episodes`() = runBlocking {
        val s = server()
        val vm = ListenViewModel(client(s), { emptyList() }, { true }, searchDebounceMillis = 0)
        awaitTrue("folders") { !vm.state.value.isLoading }
        assertEquals(listOf("English"), vm.state.value.folders.map { it.title })
        vm.loadEpisodes("f1")
        awaitTrue("episodes") { vm.state.value.episodesByFolder["f1"]?.size == 2 }
        assertEquals(setOf("a", "b"), vm.state.value.knownEpisodes.keys)
    }

    @Test
    fun `search skips short queries and fetches once for the same normalized query`() = runBlocking {
        val s = server()
        val vm = ListenViewModel(client(s), { emptyList() }, { true }, searchDebounceMillis = 0)
        awaitTrue("folders") { !vm.state.value.isLoading }
        vm.setQuery("c")
        vm.setQuery("coffee")
        awaitTrue("results") { vm.state.value.searchResults.size == 1 }
        vm.setQuery("  coffee  ")
        vm.setQuery("coffee")
        assertEquals(1, s.seen.count { it.query.containsKey("or") })
        vm.setQuery("")
        assertTrue(vm.state.value.searchResults.isEmpty())
        assertEquals(1, s.seen.count { it.query.containsKey("or") })
    }

    @Test
    fun `offline lists exactly the downloaded episodes by title, or an empty offline state`() = runBlocking {
        val online = server()
        val vm = ListenViewModel(client(online), { listOf(entry("a"), entry("b")) }, { false }, searchDebounceMillis = 0)
        awaitTrue("folders") { !vm.state.value.isLoading }
        vm.loadEpisodes("f1")
        awaitTrue("episodes") { vm.state.value.episodesByFolder["f1"] != null }
        assertEquals(listOf("Alpha", "Bravo"), vm.offlineListing().map { it.title })

        val gone = ListenViewModel(client(server(offline = true)), { emptyList() }, { false }, searchDebounceMillis = 0)
        awaitTrue("offline") { !gone.state.value.isLoading }
        assertNull(gone.state.value.error)
        assertEquals(emptyList<String>(), gone.state.value.offline?.map { it.title })
    }

    private fun courseServer(folders: String = FOLDERS, fail: Boolean = false) = FakeServer { req ->
        when {
            fail -> json("{}", HttpStatusCode.ServiceUnavailable)
            req.path.endsWith("podcast_folders") -> json(folders)
            req.path.endsWith("podcast_episodes") && req.query["select"] == "id,folder_id" -> json("""[{"id":"e1","folder_id":"f1"},{"id":"e2","folder_id":"f2"}]""")
            else -> json("[]")
        }
    }

    @Test
    fun `Listen shows the active course's folders and follows a course change`() = runBlocking {
        val vm = ListenViewModel(client(courseServer()), { emptyList() }, { true }, { "en" }, searchDebounceMillis = 0)
        awaitTrue("loaded") { !vm.state.value.isLoading }
        assertEquals(listOf("f1"), vm.state.value.folders.map { it.id })
        vm.courseChanged("fr")
        assertEquals(listOf("f2"), vm.state.value.folders.map { it.id })
        vm.courseChanged("es")
        assertTrue("a course with nothing published is an empty list, not another course's", vm.state.value.folders.isEmpty())
    }

    @Test
    fun `a successful read removes downloads of unpublished episodes but keeps the one playing`() = runBlocking {
        val removed = ArrayList<String>()
        val vm = ListenViewModel(
            client(courseServer()), { listOf(entry("e1"), entry("old"), entry("playing")) }, { true }, { "en" },
            { ids -> removed.addAll(ids) }, { "playing" }, searchDebounceMillis = 0,
        )
        awaitTrue("loaded") { !vm.state.value.isLoading }
        assertEquals(listOf("old"), removed)
    }

    @Test
    fun `a failed read or a library with no folders removes nothing`() = runBlocking {
        val removed = ArrayList<String>()
        val failing = ListenViewModel(client(courseServer(fail = true)), { listOf(entry("old")) }, { true }, { "en" }, { removed.addAll(it) }, searchDebounceMillis = 0)
        awaitTrue("failed") { !failing.state.value.isLoading }
        assertEquals("a failed read says nothing about what is published", emptyList<String>(), removed)
        val empty = ListenViewModel(client(courseServer(folders = "[]")), { listOf(entry("old")) }, { true }, { "en" }, { removed.addAll(it) }, searchDebounceMillis = 0)
        awaitTrue("empty") { !empty.state.value.isLoading }
        assertEquals("no folders is a role problem, not an empty library", emptyList<String>(), removed)
    }

    private companion object {
        const val FOLDERS = """[{"id":"f1","parent_id":null,"slug":"en","title":"English","description":null,"sort_order":0,"course":"en"},
            {"id":"f2","parent_id":null,"slug":"fr","title":"French","description":null,"sort_order":1,"course":"fr"}]"""
    }
}
