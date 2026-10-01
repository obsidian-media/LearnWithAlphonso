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
}
