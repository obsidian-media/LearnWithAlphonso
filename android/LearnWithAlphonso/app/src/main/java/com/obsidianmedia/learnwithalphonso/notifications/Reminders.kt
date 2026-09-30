package com.obsidianmedia.learnwithalphonso.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.obsidianmedia.learnwithalphonso.MainActivity
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.ReminderKind
import com.obsidianmedia.learnwithalphonso.core.logic.ReminderPlan
import com.obsidianmedia.learnwithalphonso.core.logic.ReminderPlans
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/** Port of NotificationScheduler.swift's generic half: schedule a plan or cancel a kind. */
interface ReminderScheduler {
    fun schedule(plan: ReminderPlan)
    fun cancel(kind: ReminderKind)
}

/**
 * The call sites NotificationScheduler.swift has, as one object the screens
 * call: launch, lesson completion, review queue load, weakness trend load.
 * Decisions come from core's ReminderPlans; this only routes them.
 */
class ReminderHooks(
    private val scheduler: ReminderScheduler,
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
    private val now: () -> Long = System::currentTimeMillis,
) {
    private fun apply(kind: ReminderKind, plan: ReminderPlan?) = if (plan == null) scheduler.cancel(kind) else scheduler.schedule(plan)

    /** Every launch: the streak reminder from cached progress and the always-wanted weekly recap. */
    fun onLaunch(lastActiveDate: String?) {
        apply(ReminderKind.STREAK, ReminderPlans.streak(lastActiveDate, now(), zone()))
        scheduler.schedule(ReminderPlans.weeklyRecap(now(), zone()))
    }

    fun onLessonFinished(lastActiveDate: String?) = apply(ReminderKind.STREAK, ReminderPlans.streak(lastActiveDate, now(), zone()))

    fun onQueueLoaded(items: List<ReviewItem>) = apply(ReminderKind.DUE_REVIEW, ReminderPlans.dueReview(items, now()))

    fun onWeaknessTrend(openCategories: List<String>) = apply(ReminderKind.WEAKNESS, ReminderPlans.weakness(openCategories, now(), zone()))
}

object NotificationChannels {
    const val REMINDERS = "reminders"
    const val SOCIAL = "social"

    fun ensure(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(REMINDERS, "Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Streak, review and recap reminders" })
        manager.createNotificationChannel(NotificationChannel(SOCIAL, "Friends", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Nudges and leaderboard updates" })
    }

    /** Posts a notification that opens the app; silently does nothing without POST_NOTIFICATIONS. */
    fun post(context: Context, channel: String, id: Int, title: String, body: String) {
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = PendingIntent.getActivity(
            context, id, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(id, notification) }
    }
}

/** One unique WorkManager job per kind: scheduling again replaces the pending one, as the iOS identifiers do. */
class WorkManagerReminderScheduler(private val context: Context, private val now: () -> Long = System::currentTimeMillis) : ReminderScheduler {
    override fun schedule(plan: ReminderPlan) {
        val delay = (plan.fireAtMillis - now()).coerceAtLeast(0L)
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder().putString(ReminderWorker.KIND, plan.kind.id).putString(ReminderWorker.TITLE, plan.title).putString(ReminderWorker.BODY, plan.body).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(plan.kind.id, ExistingWorkPolicy.REPLACE, request)
    }

    override fun cancel(kind: ReminderKind) {
        WorkManager.getInstance(context).cancelUniqueWork(kind.id)
    }
}

class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val kind = inputData.getString(KIND) ?: return Result.failure()
        val title = inputData.getString(TITLE) ?: return Result.failure()
        val body = inputData.getString(BODY) ?: return Result.failure()
        NotificationChannels.post(applicationContext, NotificationChannels.REMINDERS, ReminderKind.entries.indexOfFirst { it.id == kind } + 100, title, body)
        return Result.success()
    }

    companion object {
        const val KIND = "kind"
        const val TITLE = "title"
        const val BODY = "body"
    }
}
