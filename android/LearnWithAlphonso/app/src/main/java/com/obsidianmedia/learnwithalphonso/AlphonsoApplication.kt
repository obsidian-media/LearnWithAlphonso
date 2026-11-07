package com.obsidianmedia.learnwithalphonso

import android.app.Application
import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import com.obsidianmedia.learnwithalphonso.notifications.NotificationChannels

class AlphonsoApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        // First: everything below that would send reads the under-13 block (FirstRunDevice.isBlocked).
        FirstRunDevice.init(this)
        CrashReporting.start(this)
        NotificationChannels.ensure(this)
        container = AppContainer(this)
    }
}
