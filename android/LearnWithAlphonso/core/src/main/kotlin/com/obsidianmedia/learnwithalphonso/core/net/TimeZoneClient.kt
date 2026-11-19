package com.obsidianmedia.learnwithalphonso.core.net

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Port of ProgressSyncClient+TimeZoneReporter.swift. Records the signed-in learner's IANA time zone through the
 * set_my_time_zone RPC (migration 20261126100000): the server books streaks and days from it, refuses an unknown name,
 * and treats an unchanged zone as a no-op.
 */
suspend fun ProgressSyncClient.setMyTimeZone(zone: String) {
    http.requireSuccess(http.rpc("set_my_time_zone", buildJsonObject { put("_time_zone", zone) }))
}

/**
 * Sends the device's time zone after sign-in and whenever the app comes forward, but only when it differs from the last
 * one sent for this account. The last zone sent is remembered as "userId|zone" (so another account on the same device
 * always sends) and forgotten on sign-out. A failed send is not remembered.
 */
class TimeZoneReporter(private val read: () -> String?, private val write: (String?) -> Unit) {
    /** True when a zone was sent. */
    suspend fun syncIfChanged(userId: String, zone: String, send: suspend (String) -> Unit): Boolean {
        val stamp = "$userId|$zone"
        if (zone.isEmpty() || read() == stamp) return false
        try {
            send(zone)
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            return false
        }
        write(stamp)
        return true
    }

    fun forget() = write(null)

    companion object {
        const val KEY = "lastSentTimeZone"
    }
}
