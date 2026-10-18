package com.obsidianmedia.learnwithalphonso.ui.listen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClientError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastCache
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastCacheEntry
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastFolder
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastLibrary
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSearch
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ListenUiState(
    /** The folders to show: this course's, each with at least one published episode beneath it. */
    val folders: List<PodcastFolder> = emptyList(),
    /** Everything the library returned, before the course and published filters. */
    val allFolders: List<PodcastFolder> = emptyList(),
    val publishedFolderIds: Set<String> = emptySet(),
    val courseCode: String = "en",
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val searchResults: List<PodcastEpisode> = emptyList(),
    val isSearching: Boolean = false,
    val episodesByFolder: Map<String, List<PodcastEpisode>> = emptyMap(),
    val loadingFolderId: String? = null,
    /** Every episode seen this session, keyed by id, so an offline listing can name what was downloaded. */
    val knownEpisodes: Map<String, PodcastEpisode> = emptyMap(),
    val offline: List<PodcastEpisode>? = null,
)

/** Port of ListenView.swift's state: the folder tree, per-folder episodes, search and the offline listing. */
class ListenViewModel(
    private val client: PodcastClient,
    private val downloadedEntries: suspend () -> List<PodcastCacheEntry>,
    private val isConnected: () -> Boolean,
    private val courseCode: () -> String = { "en" },
    /** Removes the downloads with these ids (files and rows). */
    private val removeDownloads: suspend (List<String>) -> Unit = {},
    /** The episode playing now keeps its download until it changes. */
    private val playingEpisodeId: () -> String? = { null },
    private val searchDebounceMillis: Long = 250,
) : ViewModel() {
    private val _state = MutableStateFlow(ListenUiState())
    val state: StateFlow<ListenUiState> = _state.asStateFlow()
    private var searchJob: Job? = null
    private var lastSearchedKey: String? = null

    init {
        _state.update { it.copy(courseCode = courseCode()) }
        viewModelScope.launch { load() }
    }

    /** The active course changed: show that course's folders. */
    fun courseChanged(code: String) {
        _state.update { current ->
            if (current.courseCode == code) current else current.copy(courseCode = code, folders = visible(current.allFolders, current.publishedFolderIds, code))
        }
    }

    private fun visible(folders: List<PodcastFolder>, publishedFolderIds: Set<String>, code: String) =
        PodcastLibrary.visibleFolders(folders, publishedFolderIds, code)

    suspend fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        try {
            val folders = client.fetchFolders()
            val index = client.fetchPublishedIndex()
            val publishedFolderIds = index.map { it.folderId }.toSet()
            _state.update {
                it.copy(
                    allFolders = folders, publishedFolderIds = publishedFolderIds, folders = visible(folders, publishedFolderIds, it.courseCode),
                    isLoading = false, offline = null,
                )
            }
            // Licensing: downloads of unpublished episodes go, but only after a successful read. A read with no folders
            // is a role or policy problem, not "everything was unpublished".
            if (PodcastLibrary.canPruneDownloads(folders)) {
                removeDownloads(PodcastLibrary.unpublishedDownloads(downloadedEntries(), index.map { it.episodeId }.toSet(), playingEpisodeId()))
            }
        } catch (e: PodcastClientError.Unauthorized) {
            _state.update { it.copy(isLoading = false, error = "Please sign in again to load episodes.") }
        } catch (e: Exception) {
            if (!isConnected()) {
                val offline = PodcastCache.offlineListing(downloadedEntries(), _state.value.knownEpisodes.values.toList())
                _state.update { it.copy(isLoading = false, offline = offline) }
            } else {
                _state.update { it.copy(isLoading = false, error = "Something went wrong loading the library.") }
            }
        }
    }

    fun loadEpisodes(folderId: String) {
        viewModelScope.launch {
            _state.update { it.copy(loadingFolderId = folderId) }
            val episodes = runCatching { client.fetchEpisodes(folderId) }.getOrDefault(emptyList())
            remember(episodes)
            _state.update { it.copy(episodesByFolder = it.episodesByFolder + (folderId to episodes), loadingFolderId = null) }
        }
    }

    /** Keyed on the normalized query: "coffee" and "  coffee  " fetch once; each keystroke cancels the previous request. */
    fun setQuery(raw: String) {
        _state.update { it.copy(query = raw) }
        val key = PodcastSearch.normalizeQuery(raw)
        searchJob?.cancel()
        if (key == null) {
            lastSearchedKey = null
            _state.update { it.copy(searchResults = emptyList(), isSearching = false) }
            return
        }
        if (key == lastSearchedKey) return
        searchJob = viewModelScope.launch {
            delay(searchDebounceMillis)
            _state.update { it.copy(isSearching = true) }
            val results = runCatching { client.searchEpisodes(key) }.getOrDefault(emptyList())
            lastSearchedKey = key
            remember(results)
            _state.update { it.copy(searchResults = results, isSearching = false) }
        }
    }

    private fun remember(loaded: List<PodcastEpisode>) {
        _state.update { it.copy(knownEpisodes = it.knownEpisodes + loaded.associateBy { e -> e.id }) }
    }

    /** The downloaded set, flat, for the offline state. */
    suspend fun offlineListing(): List<PodcastEpisode> =
        PodcastCache.offlineListing(downloadedEntries(), _state.value.knownEpisodes.values.toList())
}
