package com.obsidianmedia.learnwithalphonso.ui.practice.call

import android.content.Context
import android.provider.Settings
import com.obsidianmedia.learnwithalphonso.core.avatar.CallScenes
import com.obsidianmedia.learnwithalphonso.core.avatar.CharacterKit
import com.obsidianmedia.learnwithalphonso.core.avatar.ReducedMotion

/** The Alphonso kit, read from its manifest in assets/avatar. The only kit shipped; Hector's will be another. */
internal fun alphonsoKit(context: Context): CharacterKit {
    val manifest = context.assets.open("avatar/manifest.json").bufferedReader().use { it.readText() }
    return CharacterKit.fromManifest(manifest, "alphonso", "Alphonso", "avatar", CallScenes.defaultRoom)
}

/** The person turned system animations off (animator duration scale 0): idle motion stops. */
internal fun systemMotionReduced(context: Context): Boolean =
    ReducedMotion.isReduced(Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f))

/** Hector's kit, read from its manifest in assets/hector: no ears, no glint, an `eyes-*` expression group. */
internal fun hectorKit(context: Context): CharacterKit {
    val manifest = context.assets.open("hector/manifest.json").bufferedReader().use { it.readText() }
    return CharacterKit.fromManifest(manifest, "hector", "Hector", "hector", CallScenes.defaultRoom, expressionPrefix = "eyes")
}
