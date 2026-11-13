package com.obsidianmedia.learnwithalphonso

import android.app.Application
import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsEvent
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
        // Usage analytics start only if the learner already opted in (see Analytics).
        Analytics.init(this)
        Analytics.track(AnalyticsEvent.APP_OPEN)
        NotificationChannels.ensure(this)
        container = AppContainer(this)
        container.session.onSignIn = { method ->
            Analytics.track(AnalyticsEvent.SIGN_IN_COMPLETED, mapOf("method" to method))
        }
    }
}
