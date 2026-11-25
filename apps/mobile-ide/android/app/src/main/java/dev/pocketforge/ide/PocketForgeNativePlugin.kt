package dev.pocketforge.ide

import android.content.Intent
import android.os.Build
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

@CapacitorPlugin(name = "PocketForgeNative")
class PocketForgeNativePlugin : Plugin() {

    private var daemonProcess: Process? = null
    private val daemonPort = 19527

    /**
     * Copies the bundled Alpine minirootfs for the primary ABI out of assets so
     * the daemon can extract it without needing an AssetManager. Only re-copies
     * when the asset is newer/larger, keeping startup cheap.
     */
    private fun stageRootfs(abi: String): File? {
        val containerDir = File(context.filesDir, "container").apply { mkdirs() }
        val target = File(containerDir, "alpine-$abi.tgz")
        val assetPath = "rootfs/alpine-$abi.tgz"
        return try {
            val expected = context.assets.openFd(assetPath).use { it.length }
            if (target.exists() && target.length() == expected) {
                target
            } else {
                context.assets.open(assetPath).use { input ->
                    target.outputStream().use { output -> input.copyTo(output) }
                }
                target
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun primaryAbi(): String {
        val abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"
        return when (abi) {
            "arm64-v8a", "x86_64" -> abi
            // 32-bit devices cannot run the 64-bit proot/Alpine userland; the
            // daemon then falls back to the device shell.
            else -> ""
        }
    }

    @PluginMethod
    fun startDaemon(call: PluginCall) {
        try {
            val workspaceDir = File(context.filesDir, "workspace").apply { mkdirs() }
            val toolchainsDir = File(context.filesDir, "toolchains").apply { mkdirs() }
            val containerDir = File(context.filesDir, "container").apply { mkdirs() }
            val nativeLibDir = context.applicationInfo.nativeLibraryDir
            val daemonBin = File(nativeLibDir, "libide_daemon.so")

            if (daemonProcess?.isAlive != true && daemonBin.exists()) {
                val abi = primaryAbi()
                val rootfsArchive = if (abi.isNotEmpty()) stageRootfs(abi) else null
                val prootBin = File(nativeLibDir, "libproot.so")

                val cmd = mutableListOf(
                    daemonBin.absolutePath,
                    "--port", daemonPort.toString(),
                    "--workspace", workspaceDir.absolutePath,
                    "--toolchains", toolchainsDir.absolutePath,
                    "--rootfs", File(containerDir, "alpine").absolutePath
                )
                if (rootfsArchive != null && prootBin.exists()) {
                    cmd += listOf(
                        "--rootfs-archive", rootfsArchive.absolutePath,
                        "--proot", prootBin.absolutePath,
                        "--proot-libs", nativeLibDir,
                        "--container", "auto"
                    )
                } else {
                    cmd += listOf("--container", "off")
                }

                val pb = ProcessBuilder(cmd)
                pb.directory(workspaceDir)
                pb.environment()["HOME"] = context.filesDir.absolutePath
                pb.environment()["PATH"] = "${toolchainsDir.absolutePath}/bin:/system/bin:/usr/bin"
                pb.environment()["LD_LIBRARY_PATH"] = nativeLibDir
                daemonProcess = pb.start()
            }

            val ret = JSObject().apply {
                put("port", daemonPort)
                put("rootfsPath", File(containerDir, "alpine").absolutePath)
                put("status", if (daemonProcess?.isAlive == true) "running" else "standby")
            }
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to launch libide_daemon.so: ${e.message}", e)
        }
    }

    @PluginMethod
    fun getDaemonStatus(call: PluginCall) {
        val alive = daemonProcess?.isAlive == true
        val pid = if (alive) {
            // java.lang.Process#pid() exists on OpenJDK 9+ but is absent from
            // android.jar, so resolve it reflectively where ART provides it.
            try {
                daemonProcess!!.javaClass.getMethod("pid").invoke(daemonProcess) as? Int ?: 0
            } catch (_: Exception) {
                0
            }
        } else {
            0
        }
        val ret = JSObject().apply {
            put("running", alive)
            put("port", daemonPort)
            put("pid", pid)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun setForegroundBuildActive(call: PluginCall) {
        val active = call.getBoolean("active", false) ?: false
        val title = call.getString("title", "正在执行本地离线构建...")
        val svcIntent = Intent(context, IdeForegroundService::class.java).apply {
            putExtra(IdeForegroundService.EXTRA_TITLE, title)
        }
        if (active) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svcIntent)
            } else {
                context.startService(svcIntent)
            }
        } else {
            context.stopService(svcIntent)
        }
        call.resolve()
    }

    @PluginMethod
    fun installApk(call: PluginCall) {
        val relOrAbsPath = call.getString("apkPath")
        if (relOrAbsPath.isNullOrBlank()) {
            call.reject("apkPath is required")
            return
        }

        val apkFile = if (relOrAbsPath.startsWith("/")) {
            File(relOrAbsPath)
        } else {
            File(File(context.filesDir, "workspace"), relOrAbsPath)
        }

        if (!apkFile.exists()) {
            val ret = JSObject().apply {
                put("launched", false)
                put("message", "APK 文件不存在: ${apkFile.absolutePath}")
            }
            call.resolve(ret)
            return
        }

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )
        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(installIntent)

        val ret = JSObject().apply {
            put("launched", true)
            put("message", "已唤起系统安装器: ${apkFile.name}")
        }
        call.resolve(ret)
    }
}
