package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage

/** Port of TutorMemoryContext.swift: the one priming turn that tells Hector what it already knows about the learner. */
object TutorMemoryContext {
    fun buildPrimingMessage(cefrLevel: String?, openWeaknessCategories: List<String>): ChatMessage? {
        val parts = ArrayList<String>()
        if (!cefrLevel.isNullOrEmpty()) parts.add("their current English level is $cefrLevel")
        val top = openWeaknessCategories.take(3)
        if (top.isNotEmpty()) parts.add("they've recently been working on: ${top.joinToString(", ") { it.replace('-', ' ') }}")
        if (parts.isEmpty()) return null
        return ChatMessage(
            "user",
            "[Background for you, the tutor, not part of what the learner said: " + parts.joinToString("; ") + ". Use this naturally if it's relevant, but don't just recite it back.]",
        )
    }
}

enum class BillingPeriodUnit { DAY, WEEK, MONTH, YEAR }

/** Port of BillingPeriodFormatting.swift. */
fun billingPeriodDescription(unit: BillingPeriodUnit, value: Int): String {
    if (value == 1) {
        return when (unit) {
            BillingPeriodUnit.DAY -> "Billed daily"
            BillingPeriodUnit.WEEK -> "Billed weekly"
            BillingPeriodUnit.MONTH -> "Billed monthly"
            BillingPeriodUnit.YEAR -> "Billed yearly"
        }
    }
    val word = when (unit) { BillingPeriodUnit.DAY -> "days"; BillingPeriodUnit.WEEK -> "weeks"; BillingPeriodUnit.MONTH -> "months"; BillingPeriodUnit.YEAR -> "years" }
    return "Billed every $value $word"
}
