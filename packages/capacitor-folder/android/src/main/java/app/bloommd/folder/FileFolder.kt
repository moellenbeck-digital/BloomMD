package app.bloommd.folder

import java.io.File
import java.io.IOException

/**
 * A folder addressed by an absolute path. Used by `useTestFolder` in debug builds (emulator
 * self-test without the system picker) and by the JVM unit tests of the shared rules.
 */
class FileFolder(private val root: File) : FolderBackend {
    private val lock = Any()

    override fun name(): String {
        if (!root.isDirectory) throw FolderException(FolderError.FOLDER_MISSING)
        return root.name
    }

    private fun base(): File {
        if (!root.isDirectory) throw FolderException(FolderError.FOLDER_MISSING)
        return root.canonicalFile
    }

    /** The file for these segments; refuses targets that leave the folder through symbolic links. */
    private fun target(segments: List<String>): File {
        val base = base()
        val file = segments.fold(base) { parent, name -> File(parent, name) }
        val inside = { candidate: File -> candidate.path == base.path || candidate.path.startsWith(base.path + File.separator) }
        if (!inside(file.canonicalFile)) throw FolderException(FolderError.BAD_PATH)
        return file
    }

    override fun list(extensions: Set<String>, limit: Int): FolderListing {
        val base = base()
        val files = mutableListOf<FolderEntry>()
        val pending = ArrayDeque<Pair<File, String>>()
        pending.add(base to "")
        while (pending.isNotEmpty()) {
            val (folder, prefix) = pending.removeFirst()
            val children = folder.listFiles()?.sortedBy { it.name } ?: continue
            for (child in children) {
                val name = child.name
                if (child.isDirectory) {
                    if (!FolderRules.skipsFolder(name)) pending.add(child to "$prefix$name/")
                    continue
                }
                if (FolderRules.isHidden(name) || !FolderRules.matchesExtension(name, extensions)) continue
                if (files.size >= limit) return FolderListing(files, true)
                files.add(FolderEntry("$prefix$name", child.length(), child.lastModified()))
            }
        }
        return FolderListing(files, false)
    }

    override fun read(segments: List<String>): FolderText {
        val file = target(segments)
        if (!file.isFile) throw IOException("The file does not exist.")
        return FolderText(file.readText(Charsets.UTF_8), file.lastModified())
    }

    override fun write(segments: List<String>, data: String, expectedModified: Double?, exclusive: Boolean): Long = synchronized(lock) {
        val file = target(segments)
        val parent = file.parentFile ?: throw FolderException(FolderError.BAD_PATH)
        if (!parent.isDirectory && !parent.mkdirs()) throw IOException("The folder could not be created.")
        if (exclusive) {
            // createNewFile is atomic: it fails when any other writer created the name first.
            if (!file.createNewFile()) throw FolderException(FolderError.EXISTS)
        } else {
            FolderRules.checkExpected(expectedModified, if (file.isFile) file.lastModified() else null)
        }
        // Write next to the file and move it into place, so a crash never leaves half a note.
        val temporary = File(parent, ".${file.name}.bloommd-tmp")
        try {
            temporary.writeText(data, Charsets.UTF_8)
            if (!temporary.renameTo(file)) throw IOException("The file could not be written.")
        } catch (error: IOException) {
            temporary.delete()
            // A new file that could not be written must not block the name.
            if (exclusive) file.delete()
            throw error
        }
        file.lastModified()
    }

    override fun remove(segments: List<String>) {
        synchronized(lock) {
            val file = target(segments)
            if (!file.exists()) throw IOException("The file does not exist.")
            if (!file.delete()) throw IOException("The file could not be deleted.")
        }
    }
}
