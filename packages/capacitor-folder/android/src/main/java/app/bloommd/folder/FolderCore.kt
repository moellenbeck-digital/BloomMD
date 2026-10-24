package app.bloommd.folder

import kotlin.math.abs

/**
 * Errors of the folder plugin. Messages and codes match the iOS plugin, so the app
 * (packages/mobile/src/stores.ts) handles both platforms the same way.
 */
enum class FolderError(val code: String, val message: String) {
    NO_FOLDER("NO_FOLDER", "No folder is open. Choose one first."),
    FOLDER_MISSING("FOLDER_MISSING", "The folder was moved or deleted. Open it again."),
    BAD_PATH("BAD_PATH", "The path is not inside the open folder."),
    CONFLICT("CONFLICT", "The file changed on another device. Reload it before saving."),
    EXISTS("EXISTS", "A file with this name already exists."),
}

class FolderException(val error: FolderError) : Exception(error.message)

/** One listed file; `path` is relative to the folder with "/" separators. */
data class FolderEntry(val path: String, val size: Long, val modified: Long, val local: Boolean = true)

data class FolderListing(val files: List<FolderEntry>, val truncated: Boolean)

data class FolderText(val data: String, val modified: Long)

/** Rules shared by every folder backend; plain JVM code so it is covered by unit tests. */
object FolderRules {
    /** Most files listed in one go; more are reported as `truncated` (same as iOS). */
    const val LIST_LIMIT = 5000

    /**
     * Splits a path relative to the folder into its names. Refuses anything that could leave the
     * folder or address it ambiguously: empty, absolute, "." or "..", empty segments ("a//b", "a/"),
     * backslashes and NUL characters.
     */
    fun segments(relative: String?): List<String> {
        if (relative.isNullOrEmpty() || relative.startsWith("/")) throw FolderException(FolderError.BAD_PATH)
        if (relative.contains('\\') || relative.contains('\u0000')) throw FolderException(FolderError.BAD_PATH)
        val parts = relative.split("/")
        if (parts.any { it.isEmpty() || it == "." || it == ".." }) throw FolderException(FolderError.BAD_PATH)
        return parts
    }

    /** Hidden entries (".obsidian", ".trash", ".git", dot files) are never listed or descended into. */
    fun isHidden(name: String): Boolean = name.startsWith(".")

    /** Folders that never hold notes; skipping them keeps listings of big vaults fast. */
    fun skipsFolder(name: String): Boolean = isHidden(name) || name == "node_modules"

    fun matchesExtension(name: String, extensions: Set<String>): Boolean {
        val dot = name.lastIndexOf('.')
        if (dot <= 0 || dot == name.length - 1) return false
        return extensions.contains(name.substring(dot + 1).lowercase())
    }

    fun normalizeExtensions(extensions: List<String>?): Set<String> =
        (extensions ?: listOf("md", "markdown")).map { it.lowercase().removePrefix(".") }.toSet()

    /**
     * Throws CONFLICT when a write expected a certain version of the file and finds another one:
     * deleted meanwhile (`current` null) or a modification time more than 1 ms off.
     */
    fun checkExpected(expectedModified: Double?, current: Long?) {
        if (expectedModified == null) return
        if (current == null) throw FolderException(FolderError.CONFLICT)
        if (abs(current.toDouble() - expectedModified) > 1.0) throw FolderException(FolderError.CONFLICT)
    }
}

/** A folder the plugin reads and writes; the Storage Access Framework tree or, in tests, a plain directory. */
interface FolderBackend {
    /** Display name of the folder; throws FOLDER_MISSING when it is gone or access was revoked. */
    fun name(): String

    fun list(extensions: Set<String>, limit: Int = FolderRules.LIST_LIMIT): FolderListing

    fun read(segments: List<String>): FolderText

    /** Returns the new modification time. */
    fun write(segments: List<String>, data: String, expectedModified: Double?, exclusive: Boolean): Long

    fun remove(segments: List<String>)
}
