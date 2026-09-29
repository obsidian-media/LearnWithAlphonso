package com.obsidianmedia.learnwithalphonso

import android.app.Application

class AlphonsoApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
