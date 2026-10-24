package app.bloommd.folder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Logger
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Opens a folder the user picks in the system file picker (for example an Obsidian vault on the
 * device, an SD card or a synced cloud folder) and reads and writes its files in place. Access
 * survives restarts through a persisted Storage Access Framework permission. Same JavaScript API
 * and error codes as the iOS plugin (packages/capacitor-folder/src/index.ts).
 */
@CapacitorPlugin(name = "BloomFolder")
class BloomFolderPlugin : Plugin() {
    /** Provider queries and file IO never run on the main thread. */
    private val io: ExecutorService = Executors.newFixedThreadPool(3)
    private val stateLock = Any()
    private var cached: FolderBackend? = null

    private val prefs get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val debuggable get() = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    override fun handleOnResume() {
        // The folder may have been moved, deleted or its access revoked while the app was away.
        synchronized(stateLock) { cached = null }
    }

    // Folder

    @PluginMethod
    fun pick(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION,
        )
        startActivityForResult(call, intent, "pickResult")
    }

    @ActivityCallback
    private fun pickResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true))
            return
        }
        run(call) {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.takePersistableUriPermission(uri, flags)
            val name = SafFolder(context.contentResolver, uri).name()
            synchronized(stateLock) {
                val previous = prefs.getString(KEY_TREE, null)
                // Only one folder is open at a time; the old grant would count against the system limit.
                if (previous != null && previous != uri.toString()) releaseGrant(Uri.parse(previous))
                prefs.edit().putString(KEY_TREE, uri.toString()).remove(KEY_TEST_PATH).apply()
                cached = null
            }
            JSObject().put("name", name)
        }
    }

    @PluginMethod
    fun current(call: PluginCall) {
        io.execute {
            val name = try {
                backend().name()
            } catch (error: Exception) {
                // No folder, or it is not reachable any more: the app falls back to its own folder.
                null
            }
            call.resolve(JSObject().put("name", name ?: JSONObject.NULL))
        }
    }

    @PluginMethod
    fun forget(call: PluginCall) {
        synchronized(stateLock) {
            prefs.getString(KEY_TREE, null)?.let { releaseGrant(Uri.parse(it)) }
            prefs.edit().remove(KEY_TREE).remove(KEY_TEST_PATH).apply()
            cached = null
        }
        call.resolve()
    }

    /** Debug builds only: use a folder by absolute path, so emulator tests run without the picker. */
    @PluginMethod
    fun useTestFolder(call: PluginCall) {
        if (!debuggable) return call.reject("Only available in debug builds.")
        val path = call.getString("path") ?: return call.reject("path is required")
        run(call) {
            val folder = File(path)
            if (!folder.isDirectory && !folder.mkdirs()) throw java.io.IOException("The folder could not be created.")
            synchronized(stateLock) {
                prefs.edit().putString(KEY_TEST_PATH, folder.absolutePath).apply()
                cached = null
            }
            JSObject().put("name", folder.name)
        }
    }

    private fun releaseGrant(uri: Uri) {
        try {
            context.contentResolver.releasePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        } catch (error: SecurityException) {
            Logger.warn(TAG, "Folder access was already revoked: ${error.message}")
        }
    }

    /** The open folder; NO_FOLDER when none was chosen, FOLDER_MISSING when its access is gone. */
    private fun backend(): FolderBackend = synchronized(stateLock) {
        cached?.let { return it }
        val testPath = prefs.getString(KEY_TEST_PATH, null)
        val backend = if (testPath != null && debuggable) {
            FileFolder(File(testPath))
        } else {
            val tree = prefs.getString(KEY_TREE, null)?.let(Uri::parse) ?: throw FolderException(FolderError.NO_FOLDER)
            val granted = context.contentResolver.persistedUriPermissions.any { it.uri == tree && it.isReadPermission && it.isWritePermission }
            if (!granted) throw FolderException(FolderError.FOLDER_MISSING)
            SafFolder(context.contentResolver, tree)
        }
        cached = backend
        backend
    }

    // Files

    @PluginMethod
    fun list(call: PluginCall) {
        val extensions = FolderRules.normalizeExtensions(call.getArray("extensions", null)?.toList<String>())
        run(call) {
            val listing = backend().list(extensions)
            val files = JSArray()
            for (file in listing.files) {
                files.put(
                    JSObject()
                        .put("path", file.path)
                        .put("size", file.size)
                        .put("modified", file.modified)
                        .put("local", file.local),
                )
            }
            JSObject().put("files", files).put("truncated", listing.truncated)
        }
    }

    @PluginMethod
    fun read(call: PluginCall) {
        val path = call.getString("path")
        run(call) {
            val text = backend().read(FolderRules.segments(path))
            JSObject().put("data", text.data).put("modified", text.modified)
        }
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val path = call.getString("path")
        val data = call.getString("data") ?: return call.reject("data is required")
        // Millisecond times arrive as Long from JSON; PluginCall.getDouble would return null for them.
        val expectedModified = (call.data.opt("expectedModified") as? Number)?.toDouble()
        val exclusive = call.getBoolean("exclusive", false) == true
        run(call) {
            val modified = backend().write(FolderRules.segments(path), data, expectedModified, exclusive)
            JSObject().put("modified", modified)
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val path = call.getString("path")
        run(call) {
            backend().remove(FolderRules.segments(path))
            null
        }
    }

    /** Runs `body` off the main thread and answers the call with its result or its error code. */
    private fun run(call: PluginCall, body: () -> JSObject?) {
        io.execute {
            try {
                val result = body()
                if (result == null) call.resolve() else call.resolve(result)
            } catch (error: FolderException) {
                if (error.error == FolderError.FOLDER_MISSING) synchronized(stateLock) { cached = null }
                call.reject(error.message, error.error.code)
            } catch (error: Exception) {
                Logger.error(TAG, "Folder operation failed", error)
                call.reject(error.message ?: "The folder operation failed.", error)
            }
        }
    }

    private companion object {
        const val TAG = "BloomFolder"
        const val PREFS = "app.bloommd.folder"
        const val KEY_TREE = "treeUri"
        const val KEY_TEST_PATH = "testPath"
    }
}
