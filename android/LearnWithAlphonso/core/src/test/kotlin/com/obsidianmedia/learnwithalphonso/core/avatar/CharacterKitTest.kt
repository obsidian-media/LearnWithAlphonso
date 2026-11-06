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
        assertEquals(LayerRect(0.2119140625, 0.298828125, 0.4609375, 0.4853515625), kit.mouth)
        assertEquals(0.2880859375, kit.expression.x, 0.0)
        // The realistic kit has no ear layers; the glint stays.
        assertEquals(null, kit.earLeft)
        assertEquals(null, kit.earRight)
        assertEquals(0.251953125, kit.glint!!.y, 0.0)
        assertEquals("brows-raised.webp", kit.expressionFile(Brows.RAISED))
    }

    @Test
    fun `it is the same manifest the web and iOS bundle`() {
        assertEquals(webManifest, manifest)
    }

    @Test
    fun `every layer file the code can ask for is bundled, and nothing else`() {
        // What the call actually loads for Alphonso (CharacterAvatar's rememberKitArt uses layerFiles()).
        val wanted = alphonso().layerFiles().toSet()
        // The realistic kit: base, glint, six mouths, three brows. No ear layers since #426, so no ear files either.
        assertEquals(
            setOf(
                "base.webp", "glint-mask.webp",
                "mouth-half.webp", "mouth-talk.webp", "mouth-ah.webp", "mouth-oh.webp", "mouth-ee.webp", "mouth-fv.webp",
                "brows-neutral.webp", "brows-raised.webp", "brows-lowered.webp",
            ),
            wanted,
        )
        val have = File(assets, "avatar").list()!!.filter { it.endsWith(".webp") }.toSet()
        assertEquals(wanted, have)
        // The same files the web and iOS bundle for him.
        File("../../../public/avatar").takeIf { it.exists() }?.let { web ->
            assertEquals(have, web.list()!!.filter { it.endsWith(".webp") }.toSet())
        }
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

    @Test
    fun `Hector's kit - his own folder, eyes as the expression group, no ears and no glint`() {
        val hectorManifest = File(assets, "hector/manifest.json").readText()
        val kit = CharacterKit.fromManifest(hectorManifest, "hector", "Hector", "hector", CallScenes.defaultRoom, expressionPrefix = "eyes")
        assertEquals("Hector", kit.displayName)
        assertEquals(null, kit.earLeft)
        assertEquals(null, kit.glint)
        assertEquals(LayerRect(0.255859375, 0.310546875, 0.3740234375, 0.392578125), kit.mouth)
        assertEquals(0.25, kit.expression.x, 0.0)
        assertEquals("eyes-raised.webp", kit.expressionFile(Brows.RAISED))
        val wanted = buildSet {
            add(AvatarLayerFiles.BASE)
            AvatarLayerFiles.mouthShapes.forEach { add(AvatarLayerFiles.mouth(it)!!) }
            Brows.entries.forEach { add(kit.expressionFile(it)) }
        }
        assertEquals(wanted, File(assets, "hector").list()!!.filter { it.endsWith(".webp") }.toSet())
        assertEquals("eyes", kotlinx.serialization.json.Json.parseToJsonElement(hectorManifest).let { (it as kotlinx.serialization.json.JsonObject)["expressionPrefix"] }?.let { (it as kotlinx.serialization.json.JsonPrimitive).content })
    }
}
