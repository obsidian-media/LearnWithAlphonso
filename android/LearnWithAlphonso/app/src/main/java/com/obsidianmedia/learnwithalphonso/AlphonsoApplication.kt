package com.obsidianmedia.learnwithalphonso

import android.app.Application
import com.obsidianmedia.learnwithalphonso.notifications.NotificationChannels

class AlphonsoApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        NotificationChannels.ensure(this)
        container = AppContainer(this)
    }
}
