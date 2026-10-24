package app.bloommd.folder

import android.content.ContentResolver
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import android.webkit.MimeTypeMap
import java.io.FileNotFoundException
import java.io.IOException
import java.io.OutputStream

/**
 * A folder the user granted through the Storage Access Framework (ACTION_OPEN_DOCUMENT_TREE), e.g. an
 * Obsidian vault on the device, an SD card or a synced cloud folder. Children are queried straight
 * from the DocumentsProvider (one query per folder), which stays fast for big vaults, unlike
 * DocumentFile.findFile loops.
 *
 * SAF has no compare-and-swap: conflict checks and exclusive creates run under one lock in this
 * process and re-read the provider immediately before writing. A new file is created with
 * createDocument, which never replaces an existing name (providers pick "Name (1).md" instead);
 * such a renamed result is removed again and reported as EXISTS.
 */
class SafFolder(private val resolver: ContentResolver, private val tree: Uri) : FolderBackend {
    private val rootId: String = DocumentsContract.getTreeDocumentId(tree)
    private val lock = Any()

    private data class Doc(val id: String, val name: String, val mime: String, val size: Long, val modified: Long) {
        val isDirectory get() = mime == Document.MIME_TYPE_DIR
    }

    private fun uri(id: String): Uri = DocumentsContract.buildDocumentUriUsingTree(tree, id)

    private fun Cursor.doc(): Doc = Doc(
        id = getString(0),
        name = getString(1) ?: "",
        mime = getString(2) ?: "",
        size = if (isNull(3)) 0 else getLong(3),
        modified = if (isNull(4)) 0 else getLong(4),
    )

    /**
     * Runs a provider query. Cloud providers may answer with EXTRA_LOADING first and fill in the
     * rows later; such results are asked for again for up to 15 seconds.
     */
    private fun query(target: Uri): List<Doc> {
        var attempt = 0
        while (true) {
            val cursor = try {
                resolver.query(target, PROJECTION, null, null, null)
            } catch (error: SecurityException) {
                throw FolderException(FolderError.FOLDER_MISSING)
            } catch (error: IllegalArgumentException) {
                // Providers report a missing document this way (wrapping FileNotFoundException).
                throw FileNotFoundException(error.message)
            } ?: throw FileNotFoundException("The provider returned no result.")
            cursor.use {
                val loading = it.extras?.getBoolean(DocumentsContract.EXTRA_LOADING, false) == true
                if (!loading || attempt >= LOADING_ATTEMPTS) {
                    val docs = ArrayList<Doc>(it.count)
                    while (it.moveToNext()) docs.add(it.doc())
                    return docs
                }
            }
            attempt += 1
            Thread.sleep(LOADING_POLL_MS)
        }
    }

    private fun document(id: String): Doc? = try {
        query(uri(id)).firstOrNull()
    } catch (error: FileNotFoundException) {
        null
    }

    private fun children(parentId: String): List<Doc> =
        query(DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId))

    /** Exact name first; many providers (internal storage, SD cards) ignore case, so then any case. */
    private fun find(siblings: List<Doc>, name: String): Doc? =
        siblings.firstOrNull { it.name == name } ?: siblings.singleOrNull { it.name.equals(name, ignoreCase = true) }

    /** The folder itself; a folder that was deleted, moved or whose access was revoked is FOLDER_MISSING. */
    private fun root(): Doc {
        val root = try {
            document(rootId)
        } catch (error: FolderException) {
            throw error
        } catch (error: Exception) {
            null
        }
        if (root == null || !root.isDirectory) throw FolderException(FolderError.FOLDER_MISSING)
        return root
    }

    override fun name(): String = root().name

    /** Document id of the folder holding the file; with `create`, missing subfolders are created. */
    private fun parentOf(segments: List<String>, create: Boolean): String? {
        var parent = root().id
        for (name in segments.dropLast(1)) {
            val existing = find(children(parent), name)
            parent = when {
                // Created meanwhile by another writer: use that folder.
                existing == null && create -> createChild(parent, name, Document.MIME_TYPE_DIR)
                    ?: find(children(parent), name)?.takeIf { it.isDirectory }?.id
                    ?: throw IOException("\"$name\" could not be created.")
                existing == null -> return null
                !existing.isDirectory -> throw IOException("\"$name\" is a file, not a folder.")
                else -> existing.id
            }
        }
        return parent
    }

    /**
     * Creates a document and verifies the provider kept the name. When another writer took the
     * name meanwhile, the provider renames ours ("Name (1).md"): it is deleted again and null returned.
     */
    private fun createChild(parentId: String, name: String, mime: String): String? {
        val created = try {
            DocumentsContract.createDocument(resolver, uri(parentId), mime, name)
        } catch (error: IllegalStateException) {
            null
        } ?: throw IOException("\"$name\" could not be created.")
        val id = DocumentsContract.getDocumentId(created)
        val actual = document(id)
        if (actual?.name == name) return id
        DocumentsContract.deleteDocument(resolver, created)
        return null
    }

    override fun list(extensions: Set<String>, limit: Int): FolderListing {
        val files = ArrayList<FolderEntry>()
        val pending = ArrayDeque<Pair<String, String>>()
        pending.add(root().id to "")
        while (pending.isNotEmpty()) {
            val (folder, prefix) = pending.removeFirst()
            val entries = try {
                children(folder)
            } catch (error: FileNotFoundException) {
                // A subfolder removed while listing: the rest of the vault is still listed.
                continue
            }
            for (entry in entries.sortedBy { it.name }) {
                if (entry.isDirectory) {
                    if (!FolderRules.skipsFolder(entry.name)) pending.add(entry.id to "$prefix${entry.name}/")
                    continue
                }
                if (FolderRules.isHidden(entry.name) || !FolderRules.matchesExtension(entry.name, extensions)) continue
                if (files.size >= limit) return FolderListing(files, true)
                files.add(FolderEntry("$prefix${entry.name}", entry.size, entry.modified))
            }
        }
        return FolderListing(files, false)
    }

    private fun existingFile(segments: List<String>): Doc {
        val parent = parentOf(segments, create = false) ?: throw FileNotFoundException("The file does not exist.")
        val file = find(children(parent), segments.last()) ?: throw FileNotFoundException("The file does not exist.")
        if (file.isDirectory) throw IOException("\"${file.name}\" is a folder.")
        return file
    }

    override fun read(segments: List<String>): FolderText {
        val file = existingFile(segments)
        // The time is taken before the content: a change during the read then shows up as a
        // conflict on the next save instead of being overwritten.
        val modified = document(file.id)?.modified ?: file.modified
        val bytes = resolver.openInputStream(uri(file.id))?.use { it.readBytes() }
            ?: throw IOException("The file could not be opened.")
        return FolderText(String(bytes, Charsets.UTF_8), modified)
    }

    override fun write(segments: List<String>, data: String, expectedModified: Double?, exclusive: Boolean): Long = synchronized(lock) {
        val name = segments.last()
        val parent = parentOf(segments, create = true) ?: throw IOException("The folder could not be created.")
        val siblings = children(parent)
        val bytes = data.toByteArray(Charsets.UTF_8)
        if (exclusive) {
            if (siblings.any { it.name.equals(name, ignoreCase = true) }) throw FolderException(FolderError.EXISTS)
            val id = createChild(parent, name, mimeOf(name)) ?: throw FolderException(FolderError.EXISTS)
            try {
                writeContent(uri(id), bytes)
            } catch (error: Exception) {
                // A new file that could not be written must not block the name.
                runCatching { DocumentsContract.deleteDocument(resolver, uri(id)) }
                throw error
            }
            return document(id)?.modified ?: System.currentTimeMillis()
        }
        val existing = find(siblings, name)
        if (existing?.isDirectory == true) throw IOException("\"$name\" is a folder.")
        // Re-read right before writing: the window for another app to slip in stays as small as SAF allows.
        val current = existing?.let { document(it.id) }
        FolderRules.checkExpected(expectedModified, current?.modified)
        // A file another app created since the check is never replaced by a first save.
        val id = current?.id ?: createChild(parent, name, mimeOf(name)) ?: throw FolderException(FolderError.CONFLICT)
        writeContent(uri(id), bytes)
        document(id)?.modified ?: System.currentTimeMillis()
    }

    override fun remove(segments: List<String>) {
        synchronized(lock) {
            val file = existingFile(segments)
            if (!DocumentsContract.deleteDocument(resolver, uri(file.id))) throw IOException("The file could not be deleted.")
        }
    }

    /** Replaces the content. "wt" truncates; providers without it get "rw" and an explicit truncate. */
    private fun writeContent(target: Uri, bytes: ByteArray) {
        val stream: OutputStream? = try {
            resolver.openOutputStream(target, "wt")
        } catch (error: IllegalArgumentException) {
            null
        } catch (error: UnsupportedOperationException) {
            null
        } catch (error: FileNotFoundException) {
            null
        }
        if (stream != null) {
            stream.use { it.write(bytes) }
            return
        }
        val descriptor = resolver.openFileDescriptor(target, "rw") ?: throw IOException("The file could not be opened for writing.")
        ParcelFileDescriptor.AutoCloseOutputStream(descriptor).use { out ->
            out.channel.truncate(0)
            out.write(bytes)
        }
    }

    private fun mimeOf(name: String): String {
        val extension = name.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "application/octet-stream"
    }

    private companion object {
        val PROJECTION = arrayOf(
            Document.COLUMN_DOCUMENT_ID,
            Document.COLUMN_DISPLAY_NAME,
            Document.COLUMN_MIME_TYPE,
            Document.COLUMN_SIZE,
            Document.COLUMN_LAST_MODIFIED,
        )
        const val LOADING_ATTEMPTS = 50
        const val LOADING_POLL_MS = 300L
    }
}
