package app.bloommd.folder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class FolderRulesTest {
    private fun assertError(expected: FolderError, body: () -> Unit) {
        try {
            body()
            fail("expected $expected")
        } catch (error: FolderException) {
            assertEquals(expected, error.error)
        }
    }

    @Test
    fun splitsRelativePaths() {
        assertEquals(listOf("Physik.md"), FolderRules.segments("Physik.md"))
        assertEquals(listOf("Schule", "Physik ink.svg"), FolderRules.segments("Schule/Physik ink.svg"))
        assertEquals(listOf("Ä", "Wärme.md"), FolderRules.segments("Ä/Wärme.md"))
    }

    @Test
    fun refusesPathsThatLeaveOrBlurTheFolder() {
        for (path in listOf(null, "", "/etc/passwd", "../x.md", "a/../../x.md", "a/./b.md", ".", "..", "a//b.md", "a/", "a\\..\\b.md", "a\u0000.md")) {
            assertError(FolderError.BAD_PATH) { FolderRules.segments(path) }
        }
    }

    @Test
    fun errorCodesMatchIos() {
        assertEquals(
            listOf("NO_FOLDER", "FOLDER_MISSING", "BAD_PATH", "CONFLICT", "EXISTS"),
            FolderError.entries.map { it.code },
        )
        assertEquals("The file changed on another device. Reload it before saving.", FolderError.CONFLICT.message)
    }

    @Test
    fun hidesDotFoldersAndMatchesExtensions() {
        assertTrue(FolderRules.skipsFolder(".obsidian"))
        assertTrue(FolderRules.skipsFolder(".trash"))
        assertTrue(FolderRules.skipsFolder("node_modules"))
        assertFalse(FolderRules.skipsFolder("Schule"))
        val md = FolderRules.normalizeExtensions(null)
        assertTrue(FolderRules.matchesExtension("Physik.MD", md))
        assertTrue(FolderRules.matchesExtension("a.markdown", md))
        assertFalse(FolderRules.matchesExtension("Physik.md.txt", md))
        assertFalse(FolderRules.matchesExtension(".md", md))
        assertFalse(FolderRules.matchesExtension("md", md))
        assertTrue(FolderRules.matchesExtension("x.svg", FolderRules.normalizeExtensions(listOf(".SVG"))))
    }

    @Test
    fun expectedModificationTime() {
        FolderRules.checkExpected(null, null)
        FolderRules.checkExpected(null, 5)
        FolderRules.checkExpected(1000.0, 1000)
        FolderRules.checkExpected(1000.4, 1001)
        assertError(FolderError.CONFLICT) { FolderRules.checkExpected(1000.0, 1002) }
        assertError(FolderError.CONFLICT) { FolderRules.checkExpected(1000.0, null) }
    }
}
