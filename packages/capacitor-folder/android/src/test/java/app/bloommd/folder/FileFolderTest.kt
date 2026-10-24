package app.bloommd.folder

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileFolderTest {
    @get:Rule
    val temporary = TemporaryFolder()

    private fun folder(): Pair<File, FileFolder> {
        val root = temporary.newFolder("Vault")
        return root to FileFolder(root)
    }

    private fun path(value: String) = FolderRules.segments(value)

    private fun assertError(expected: FolderError, body: () -> Unit) {
        try {
            body()
            fail("expected $expected")
        } catch (error: FolderException) {
            assertEquals(expected, error.error)
        }
    }

    @Test
    fun writesReadsAndListsNotesInNestedFolders() {
        val (root, vault) = folder()
        assertEquals("Vault", vault.name())
        val modified = vault.write(path("Schule/Physik.md"), "# Physik\n", null, false)
        vault.write(path("Arbeit/Teammeeting.md"), "# Teammeeting\n", null, false)
        vault.write(path(".obsidian/workspace.md"), "intern", null, false)
        vault.write(path("node_modules/x/readme.md"), "dep", null, false)
        vault.write(path("Schule/Bild.png"), "png", null, false)
        File(root, "Schule/.hidden.md").writeText("hidden")

        val text = vault.read(path("Schule/Physik.md"))
        assertEquals("# Physik\n", text.data)
        assertEquals(modified, text.modified)

        val listing = vault.list(FolderRules.normalizeExtensions(null))
        assertEquals(listOf("Arbeit/Teammeeting.md", "Schule/Physik.md"), listing.files.map { it.path }.sorted())
        assertFalse(listing.truncated)
        assertTrue(listing.files.all { it.local })
    }

    @Test
    fun reportsTruncatedListings() {
        val (_, vault) = folder()
        for (index in 1..3) vault.write(path("n$index.md"), "#", null, false)
        val listing = vault.list(setOf("md"), limit = 2)
        assertEquals(2, listing.files.size)
        assertTrue(listing.truncated)
    }

    @Test
    fun refusesStaleWritesAndKeepsTheOtherVersion() {
        val (root, vault) = folder()
        val loaded = vault.write(path("Physik.md"), "v1", null, false)
        File(root, "Physik.md").apply {
            writeText("from the Mac")
            setLastModified(loaded + 5000)
        }
        assertError(FolderError.CONFLICT) { vault.write(path("Physik.md"), "from Android", loaded.toDouble(), false) }
        assertEquals("from the Mac", vault.read(path("Physik.md")).data)

        val current = vault.read(path("Physik.md")).modified
        vault.write(path("Physik.md"), "from Android", current.toDouble(), false)
        assertEquals("from Android", vault.read(path("Physik.md")).data)
    }

    @Test
    fun aNoteDeletedElsewhereIsAConflict() {
        val (_, vault) = folder()
        val loaded = vault.write(path("Weg.md"), "# Weg", null, false)
        vault.remove(path("Weg.md"))
        assertError(FolderError.CONFLICT) { vault.write(path("Weg.md"), "# Neu", loaded.toDouble(), false) }
    }

    @Test
    fun exclusiveCreateNeverReplacesAFile() {
        val (_, vault) = folder()
        vault.write(path("Arbeit/Teammeeting.md"), "# Teammeeting\n", null, false)
        assertError(FolderError.EXISTS) { vault.write(path("Arbeit/Teammeeting.md"), "# Überschrieben", null, true) }
        assertEquals("# Teammeeting\n", vault.read(path("Arbeit/Teammeeting.md")).data)
        vault.write(path("Arbeit/Neu.md"), "# Neu\n", null, true)
        assertEquals("# Neu\n", vault.read(path("Arbeit/Neu.md")).data)
    }

    @Test
    fun refusesSymbolicLinksOutOfTheFolder() {
        val (root, vault) = folder()
        val outside = temporary.newFolder("Outside")
        File(outside, "secret.md").writeText("secret")
        java.nio.file.Files.createSymbolicLink(File(root, "link").toPath(), outside.toPath())
        assertError(FolderError.BAD_PATH) { vault.read(path("link/secret.md")) }
    }

    @Test
    fun aMissingFolderIsReported() {
        val (root, vault) = folder()
        root.deleteRecursively()
        assertError(FolderError.FOLDER_MISSING) { vault.name() }
        assertError(FolderError.FOLDER_MISSING) { vault.list(setOf("md")) }
    }
}
