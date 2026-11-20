package com.obsidianmedia.learnwithalphonso.core.logic

import java.io.File
import java.util.UUID

/**
 * The short-lived files Say it right writes only so the system can decode a clip's samples for its waveform (the
 * learner's voice among them). They are deleted straight after the decode; this names them with one distinctive prefix
 * so a process killed mid-decode cannot leave a voice behind: [sweep] removes every leftover, at app launch and each
 * time the screen opens. Mirrors LearnWithAlphonsoKit/ClipTempFiles.swift.
 */
object ClipTempFiles {
    const val PREFIX = "sir-wave-"

    /** A fresh file in [dir] carrying the prefix (not created on disk). */
    fun create(dir: File, extension: String = "audio"): File = File(dir, "$PREFIX${UUID.randomUUID()}.$extension")

    /** Deletes every leftover in [dir], and returns how many it removed. */
    fun sweep(dir: File): Int = dir.listFiles { f -> f.isFile && f.name.startsWith(PREFIX) }.orEmpty().count { it.delete() }
}
