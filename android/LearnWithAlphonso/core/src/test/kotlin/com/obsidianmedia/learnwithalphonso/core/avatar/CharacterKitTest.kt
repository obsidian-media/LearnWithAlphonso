package com.obsidianmedia.learnwithalphonso.core.avatar

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

class CharacterKitTest {
    private val assets = File("../app/src/main/assets")
    private val manifest = File(assets, "avatar/manifest.json").readText()
    private val webManifest = File("../../../public/avatar/manifest.json").takeIf { it.exists() }?.readText()

    private fun alphonso() = CharacterKit.fromManifest(manifest, "alphonso", "Alphonso", "avatar", CallScenes.defaultRoom)

    @Test
    fun `the Alphonso kit reads its layer placement from its manifest`() {
        val kit = alphonso()
        assertEquals("Alphonso", kit.displayName)
        assertEquals(LayerRect(0.3508771929824561, 0.3684210526315789, 0.27910685805422647, 0.18341307814992025), kit.mouth)
        assertEquals(0.31100478468899523, kit.expression.x, 0.0)
        assertEquals(0.23125996810207336, kit.earLeft!!.x, 0.0)
        assertEquals(0.5055821371610846, kit.earRight!!.x, 0.0)
        assertEquals(0.24242424242424243, kit.glint!!.y, 0.0)
        assertEquals("brows-raised.webp", kit.expressionFile(Brows.RAISED))
    }

    @Test
    fun `it is the same manifest the web and iOS bundle`() {
        assertEquals(webManifest, manifest)
    }

    @Test
    fun `every layer file the code can ask for is bundled, and nothing else`() {
        val wanted = buildSet {
            add(AvatarLayerFiles.BASE); add(AvatarLayerFiles.GLINT_MASK)
            AvatarLayerFiles.mouthShapes.forEach { add(AvatarLayerFiles.mouth(it)!!) }
            Brows.entries.forEach { add(AvatarLayerFiles.brows(it)) }
            for (side in EarSide.entries) for (t in listOf(false, true)) add(AvatarLayerFiles.ear(side, t))
        }
        assertEquals(15, wanted.size)
        val have = File(assets, "avatar").list()!!.filter { it.endsWith(".webp") }.toSet()
        assertEquals(wanted, have)
    }

    @Test
    fun `every scenario has a picture and the default room has an evening one`() {
        val scenes = File(assets, "scenes").list()!!.toSet()
        for (id in CallScenes.scenarioIds) assertTrue("$id.webp" in scenes, id)
        assertTrue("${CallScenes.defaultRoom.light}.webp" in scenes)
        assertTrue("${CallScenes.defaultRoom.dark}.webp" in scenes)
    }

    @Test
    fun `the setting defaults on with the shared key`() {
        assertEquals("showAlphonsoWhilePractising", AvatarPreference.KEY)
        assertTrue(AvatarPreference.DEFAULT)
    }

    @Test
    fun `animations off means reduced motion`() {
        assertTrue(ReducedMotion.isReduced(0f))
        assertFalse(ReducedMotion.isReduced(1f))
        assertFalse(ReducedMotion.isReduced(0.5f))
    }

    @Test
    fun `the kit is a parameter - another character has its own name folder and room`() {
        val office = CallRoom("office-light", "office-dark", dimInDark = false)
        val other = CharacterKit.fromManifest(manifest, "hector", "Hector", "hector", office)
        assertEquals("Hector", other.displayName)
        assertEquals("hector", other.assetFolder)
        assertEquals(office, CallScenes.room("free-talk", fallback = other.defaultRoom))
    }

    @Test
    fun `a kit without ear layers or a glint, and with an eyes expression group, reads from its manifest`() {
        val hector = """{"layers":{"mouth-ah":{"x":0.4,"y":0.4,"w":0.2,"h":0.1},"eyes-neutral":{"x":0.3,"y":0.2,"w":0.3,"h":0.1}}}"""
        val kit = CharacterKit.fromManifest(hector, "hector", "Hector", "hector", CallScenes.defaultRoom, expressionPrefix = "eyes")
        assertEquals(null, kit.earLeft)
        assertEquals(null, kit.earRight)
        assertEquals(null, kit.glint)
        assertEquals(0.3, kit.expression.x, 0.0)
        assertEquals("eyes-lowered.webp", kit.expressionFile(Brows.LOWERED))
    }
}
