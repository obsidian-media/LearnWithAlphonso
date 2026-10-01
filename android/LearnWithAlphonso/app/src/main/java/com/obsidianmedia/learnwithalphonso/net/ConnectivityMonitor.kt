package com.obsidianmedia.learnwithalphonso.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Port of NetworkMonitor.swift over ConnectivityManager; true until proven otherwise. */
class ConnectivityMonitor(context: Context) {
    private val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val _isConnected = MutableStateFlow(currentlyConnected())
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    init {
        val request = NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build()
        manager.registerNetworkCallback(
            request,
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { _isConnected.value = true }
                override fun onLost(network: Network) { _isConnected.value = currentlyConnected() }
                override fun onUnavailable() { _isConnected.value = false }
            },
        )
    }

    private fun currentlyConnected(): Boolean {
        val caps = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
