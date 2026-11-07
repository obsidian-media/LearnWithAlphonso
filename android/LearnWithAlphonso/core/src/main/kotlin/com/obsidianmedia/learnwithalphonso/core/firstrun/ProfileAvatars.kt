package com.obsidianmedia.learnwithalphonso.core.firstrun

/**
 * The 16 preset profile pictures (the web's src/lib/profile-avatars.ts, the iOS Kit's ProfileAvatars.swift): animal
 * friends of Alphonso. Presets only, no uploads. Stored in profiles.avatar_seed as "animal:<id>", the column friends,
 * leaderboards and study buddies already read; any other seed shows initials. The art is assets/avatars/<id>.webp.
 */
object ProfileAvatars {
    data class Avatar(val id: String, val label: String)

    val all = listOf(
        Avatar("llama-rose", "Rose llama"),
        Avatar("llama-cocoa", "Cocoa llama"),
        Avatar("alpaca", "Alpaca"),
        Avatar("fox", "Fox"),
        Avatar("owl", "Owl"),
        Avatar("cat", "Cat"),
        Avatar("panda", "Panda"),
        Avatar("bear", "Bear"),
        Avatar("rabbit", "Rabbit"),
        Avatar("penguin", "Penguin"),
        Avatar("parrot", "Parrot"),
        Avatar("koala", "Koala"),
        Avatar("lion", "Lion"),
        Avatar("hedgehog", "Hedgehog"),
        Avatar("corgi", "Corgi"),
        Avatar("deer", "Deer"),
    )

    private const val PREFIX = "animal:"
    private val colourSeed = Regex("^[A-Za-z0-9]{1,32}$")

    fun seedFor(id: String): String = PREFIX + id

    /** The animal a seed names, or null (initials) for any other seed, including an unknown animal. */
    fun animalFromSeed(seed: String?): Avatar? {
        if (seed == null || !seed.startsWith(PREFIX)) return null
        val id = seed.removePrefix(PREFIX)
        return all.firstOrNull { it.id == id }
    }

    /** What may be written to avatar_seed: an animal from the list, or a plain colour seed (letters and digits). */
    fun isAllowedSeed(seed: String): Boolean =
        if (seed.startsWith(PREFIX)) animalFromSeed(seed) != null else colourSeed.matches(seed)

    /** The seed "My initial" writes: the learner's old colour seed when they have one, so their colour stays. */
    fun initialsSeed(current: String?): String =
        current?.takeIf { it.isNotEmpty() && animalFromSeed(it) == null && isAllowedSeed(it) } ?: "a"

    fun initial(name: String?): String = name?.trim()?.take(1)?.uppercase()?.takeIf { it.isNotEmpty() } ?: "?"

    fun assetPath(id: String): String = "avatars/$id.webp"
}
