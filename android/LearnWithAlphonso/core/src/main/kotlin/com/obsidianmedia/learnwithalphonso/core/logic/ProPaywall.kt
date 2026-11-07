package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Currency
import java.util.Locale

/**
 * The round-6 Alphonso Pro paywall's wording and logic (port of ProPaywall.swift and PaywallPresentation.swift; the web's
 * twin is src/lib/paywall-copy.ts). No price, currency, trial, saving or daily number lives here: they are worked out
 * from the store products for each learner, and the daily allowance is "a long conversation every day".
 */
data class PaywallPeriod(val unit: BillingPeriodUnit, val value: Int) {
    companion object {
        /** "P7D", "P2W", "P1M", "P1Y" (the store's ISO 8601 length) or null when it is not a plain one-unit period. */
        fun parseIso(iso: String?): PaywallPeriod? {
            val match = Regex("^P(\\d+)([DWMY])$").matchEntire(iso?.trim().orEmpty()) ?: return null
            val value = match.groupValues[1].toInt()
            if (value < 1) return null
            val unit = when (match.groupValues[2]) {
                "D" -> BillingPeriodUnit.DAY
                "W" -> BillingPeriodUnit.WEEK
                "M" -> BillingPeriodUnit.MONTH
                else -> BillingPeriodUnit.YEAR
            }
            return PaywallPeriod(unit, value)
        }
    }
}

/** What the paywall needs from a store product. [trial] is set only when this learner is eligible for a free trial. */
data class PaywallPlan(
    val id: String, val priceString: String, val priceMicros: Long, val currencyCode: String?,
    val period: PaywallPeriod, val trial: PaywallPeriod?,
)

data class PaywallWhenLine(val lead: String, val rest: String)

data class PaywallPlanOption(
    val id: String, val title: String, val priceLine: String, val savingsLine: String?, val perMonthLine: String,
    val trialNote: String?, val isSelected: Boolean,
)

data class ProPaywallPresentation(
    val productId: String, val options: List<PaywallPlanOption>, val priceLine: String, val trialLine: String?,
    val ctaTitle: String, val whenLine: PaywallWhenLine, val renewal: String,
)

/** The price line and the trial line are drawn at these sizes (sp): the price is never smaller (store policy). */
object PaywallTextSizes {
    const val PRICE_SP = 22
    const val TRIAL_SP = 22
}

object PaywallPricing {
    fun isYearly(p: PaywallPeriod) =
        (p.unit == BillingPeriodUnit.YEAR && p.value == 1) || (p.unit == BillingPeriodUnit.MONTH && p.value == 12)

    private fun word(unit: BillingPeriodUnit, plural: Boolean): String {
        val base = when (unit) {
            BillingPeriodUnit.DAY -> "day"
            BillingPeriodUnit.WEEK -> "week"
            BillingPeriodUnit.MONTH -> "month"
            BillingPeriodUnit.YEAR -> "year"
        }
        return if (plural) base + "s" else base
    }

    fun planTitle(p: PaywallPeriod): String = when {
        isYearly(p) -> "Yearly"
        p.value == 1 -> when (p.unit) {
            BillingPeriodUnit.DAY -> "Daily"
            BillingPeriodUnit.WEEK -> "Weekly"
            BillingPeriodUnit.MONTH -> "Monthly"
            BillingPeriodUnit.YEAR -> "Yearly"
        }
        else -> "Every ${p.value} ${word(p.unit, true)}"
    }

    fun priceLine(price: String, p: PaywallPeriod): String = when {
        isYearly(p) -> "$price / year"
        p.value == 1 -> "$price / ${word(p.unit, false)}"
        else -> "$price every ${p.value} ${word(p.unit, true)}"
    }

    fun compactPrice(price: String, p: PaywallPeriod): String = when {
        isYearly(p) -> "$price/year"
        p.value == 1 -> "$price/${word(p.unit, false)}"
        else -> "$price every ${p.value} ${word(p.unit, true)}"
    }

    fun duration(p: PaywallPeriod) = "${p.value} ${word(p.unit, p.value != 1)}"

    /** "2-week", "7-day". */
    fun trialLength(p: PaywallPeriod) = "${p.value}-${word(p.unit, false)}"

    /** A yearly plan's price per month in its own currency, else the period's own words. Never an invented number. */
    fun perMonthLine(plan: PaywallPlan, locale: Locale = Locale.ENGLISH): String {
        val code = plan.currencyCode
        if (isYearly(plan.period) && code != null && plan.priceMicros > 0) {
            val format = runCatching { NumberFormat.getCurrencyInstance(locale).apply { currency = Currency.getInstance(code) } }.getOrNull()
            if (format != null) return "${format.format(plan.priceMicros / 12.0 / 1_000_000.0)} a month"
        }
        if (plan.period.value == 1) return "per ${word(plan.period.unit, false)}"
        return planTitle(plan.period).lowercase()
    }

    /** Whole percent the yearly plan saves against twelve monthly payments (rounded down), or null under 5% / not comparable. */
    fun yearlySaving(plans: List<PaywallPlan>): Int? {
        val yearly = plans.firstOrNull { isYearly(it.period) } ?: return null
        val monthly = plans.firstOrNull { it.period == PaywallPeriod(BillingPeriodUnit.MONTH, 1) } ?: return null
        if (monthly.priceMicros <= 0 || yearly.priceMicros <= 0) return null
        if (yearly.currencyCode != monthly.currencyCode) return null
        val twelve = monthly.priceMicros * 12
        if (yearly.priceMicros >= twelve) return null
        val percent = ((twelve - yearly.priceMicros) * 100 / twelve).toInt()
        return if (percent >= 5) percent else null
    }
}

object PaywallDates {
    /** When the first payment is taken: the offer's period after today, or today when there is no trial. */
    fun firstPaymentDate(today: LocalDate, trial: PaywallPeriod?): LocalDate {
        if (trial == null || trial.value < 1) return today
        val n = trial.value.toLong()
        return when (trial.unit) {
            BillingPeriodUnit.DAY -> today.plusDays(n)
            BillingPeriodUnit.WEEK -> today.plusWeeks(n)
            BillingPeriodUnit.MONTH -> today.plusMonths(n)
            BillingPeriodUnit.YEAR -> today.plusYears(n)
        }
    }

    /** The dashed "when do I pay" row. Without an eligible trial it never mentions one. */
    fun whenLine(trial: PaywallPeriod?, today: LocalDate, locale: Locale = Locale.ENGLISH): PaywallWhenLine {
        if (trial == null || trial.value < 1) {
            return PaywallWhenLine("First payment today, when you confirm.", "Cancel any time and it stops the next renewal.")
        }
        val date = firstPaymentDate(today, trial)
        val pattern = if (date.year == today.year) "MMMM d" else "MMMM d, yyyy"
        val day = DateTimeFormatter.ofPattern(pattern, locale).format(date)
        return PaywallWhenLine("Nothing to pay today.", "First payment on $day. Cancel before then and you pay nothing.")
    }
}

object ProPaywall {
    fun make(plans: List<PaywallPlan>, selectedId: String?, today: LocalDate, locale: Locale = Locale.ENGLISH): ProPaywallPresentation? {
        val usable = plans.filter { it.period.value >= 1 && it.priceString.isNotBlank() }
        if (usable.isEmpty()) return null
        val ordered = usable.filter { PaywallPricing.isYearly(it.period) } + usable.filterNot { PaywallPricing.isYearly(it.period) }
        val chosen = usable.firstOrNull { it.id == selectedId } ?: ordered.first()
        val price = chosen.priceString.trim()
        val trial = chosen.trial?.takeIf { it.value >= 1 }
        val recurring = PaywallPricing.compactPrice(price, chosen.period)
        val saving = if (ordered.size > 1) PaywallPricing.yearlySaving(ordered) else null
        val options = if (ordered.size > 1) ordered.map {
            PaywallPlanOption(
                id = it.id, title = PaywallPricing.planTitle(it.period),
                priceLine = PaywallPricing.priceLine(it.priceString.trim(), it.period),
                savingsLine = if (PaywallPricing.isYearly(it.period)) saving?.let { s -> "Save $s%" } else null,
                perMonthLine = PaywallPricing.perMonthLine(it, locale),
                trialNote = it.trial?.takeIf { t -> t.value >= 1 }?.let { t -> "${PaywallPricing.trialLength(t)} free trial" },
                isSelected = it.id == chosen.id,
            )
        } else emptyList()
        val renewal = if (trial != null) {
            "After the free trial, Alphonso Pro renews automatically at $recurring until you cancel. Payment is charged to your Google Play account when the trial ends. Cancel in Google Play at least 24 hours before the trial or any period ends."
        } else {
            "Alphonso Pro renews automatically at $recurring until you cancel. Payment is charged to your Google Play account when you confirm the purchase. Cancel in Google Play at least 24 hours before the current period ends."
        }
        return ProPaywallPresentation(
            productId = chosen.id, options = options,
            priceLine = PaywallPricing.priceLine(price, chosen.period),
            trialLine = trial?.let { "Free for ${PaywallPricing.duration(it)}, then $recurring" },
            ctaTitle = if (trial != null) "Start free trial" else "Subscribe",
            whenLine = PaywallDates.whenLine(trial, today, locale),
            renewal = renewal,
        )
    }
}

data class ProExampleCall(val before: String, val recalled: String, val after: String, val reply: String, val praise: String)

object ProPaywallCopy {
    const val KICKER = "Alphonso Pro"
    const val HEADLINE_LEAD = "A tutor who "
    const val HEADLINE_MARK = "remembers you"
    const val HEADLINE_END = "."
    const val EXAMPLE_LABEL = "Example call"
    val facts = listOf("Any topic" to "no script", "Remembers" to "your weak spots", "Every day" to "a long conversation")
    const val FACTS_SPOKEN = "Any topic, no script. Remembers your weak spots. A long conversation every day."
    const val FREE_LABEL = "Free for everyone"
    val freeItems = listOf("Lessons", "Alphonso calls", "Audio", "Review")
    const val FREE_NOTE = "Everything else stays free, always."
    const val ROOM_LABEL = "Hector in his library"
    const val WELCOME_EYEBROW = "Welcome to Pro"
    const val WELCOME_READY = "Hector's ready."
    const val WELCOME_BODY = "Start anywhere. He'll remember it next time."
    const val OPENERS_TITLE = "Try one of these"
    const val CALL_HECTOR = "Call Hector"
    fun welcomeGreeting(name: String?) = name?.let { "Welcome, $it." } ?: "Welcome to Alphonso Pro."

    fun exampleCall(course: Course): ProExampleCall = when (course) {
        Course.SPANISH -> ProExampleCall("Last week you said ", "“soy cansado”", ". How are you feeling today?", "Estoy cansado, pero feliz.", "¡Perfecto! Estar for feelings. Nailed it.")
        Course.FRENCH -> ProExampleCall("Last week you said ", "“je suis faim”", ". Are you hungry today?", "Oui, j'ai faim !", "Parfait ! Avoir for hunger. Nailed it.")
        Course.ENGLISH -> ProExampleCall("Last week you said ", "“I am agree”", ". What do you think of the plan?", "I agree, it's a great plan.", "Perfect! Just “I agree”. Nailed it.")
    }

    fun openers(course: Course): List<String> {
        val middle = when (course) {
            Course.SPANISH -> "“Help me practise ser and estar”"
            Course.FRENCH -> "“Help me practise tu and vous”"
            Course.ENGLISH -> "“Help me practise the present perfect”"
        }
        return listOf("“Tell me about your weekend”", middle, "“Let's chat about a film I like”")
    }

    /** The first name for the Pro card, or null for a generated Learner-XXXX handle or no name. */
    fun cardFirstName(displayName: String?): String? {
        val name = displayName?.trim().orEmpty()
        if (name.isEmpty() || DisplayNameOnboarding.isLearnerHandle(name)) return null
        return name.split(Regex("\\s+")).first()
    }

    val allText: List<String>
        get() = listOf(KICKER, HEADLINE_LEAD + HEADLINE_MARK + HEADLINE_END, EXAMPLE_LABEL, FACTS_SPOKEN, FREE_LABEL, FREE_NOTE, ROOM_LABEL, WELCOME_EYEBROW, WELCOME_READY, WELCOME_BODY, OPENERS_TITLE, CALL_HECTOR) +
            facts.flatMap { listOf(it.first, it.second) } + freeItems +
            Course.entries.flatMap { c -> exampleCall(c).let { listOf(it.before, it.recalled, it.after, it.reply, it.praise) } + openers(c) }
}
