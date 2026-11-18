package dev.pocketforge.ide

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground Service keeping the local Linux PTY daemon and C++/Rust/Kotlin compilers
 * elevated so Android 12+ Phantom Process Killer does not reap active build sessions.
 */
class IdeForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "pocketforge_compiler_channel"
        const val NOTIFICATION_ID = 19527
        const val EXTRA_TITLE = "extra_title"
    }

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val statusTitle = intent?.getStringExtra(EXTRA_TITLE) ?: "PocketForge 本地 Linux 容器运行中"
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PocketForge IDE")
            .setContentText(statusTitle)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PocketForge 编译与终端保活服务",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "保障后台编译 C++/Rust/Android APK 与 PTY 终端不被系统回收"
            }
            val mgr = getSystemService(NotificationManager::class.java)
            mgr?.createNotificationChannel(channel)
        }
    }
}
