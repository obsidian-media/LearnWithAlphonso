package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.time.LocalDate

class ProPaywallTest {
    private val today = LocalDate.of(2026, 11, 7)
    private val year = PaywallPeriod(BillingPeriodUnit.YEAR, 1)
    private val month = PaywallPeriod(BillingPeriodUnit.MONTH, 1)

    private fun offer(trial: PaywallPeriod?, yearlyMicros: Long = 60_000_000, monthlyMicros: Long = 9_000_000, code: String? = "USD") = listOf(
        PaywallPlan("yearly", "\$60.00", yearlyMicros, code, year, trial),
        PaywallPlan("monthly", "\$9.00", monthlyMicros, code, month, trial),
    )

    private fun make(plans: List<PaywallPlan>, selected: String? = null) = ProPaywall.make(plans, selected, today)!!

    @Test
    fun `no eligible trial means no trial line, note, free or pay-nothing wording and a Subscribe button`() {
        val p = make(offer(null))
        assertNull(p.trialLine)
        assertEquals("Subscribe", p.ctaTitle)
        assertTrue(p.options.all { it.trialNote == null })
        val all = (listOf(p.whenLine.lead, p.whenLine.rest, p.renewal)).joinToString(" ").lowercase()
        assertFalse(all.contains("trial"), all)
        assertFalse(all.contains("free"), all)
        assertFalse(all.contains("pay nothing"), all)
    }

    @Test
    fun `an eligible trial shows the trial line and Start free trial`() {
        val p = make(offer(PaywallPeriod(BillingPeriodUnit.DAY, 7)))
        assertEquals("Free for 7 days, then \$60.00/year", p.trialLine)
        assertEquals("Start free trial", p.ctaTitle)
    }

    @Test
    fun `the price is drawn at least as large as the trial`() {
        assertTrue(PaywallTextSizes.PRICE_SP >= PaywallTextSizes.TRIAL_SP)
    }

    @Test
    fun `the first payment date is today plus the offer period`() {
        assertEquals(LocalDate.of(2026, 11, 14), PaywallDates.firstPaymentDate(today, PaywallPeriod(BillingPeriodUnit.DAY, 7)))
        assertEquals(LocalDate.of(2026, 11, 21), PaywallDates.firstPaymentDate(today, PaywallPeriod(BillingPeriodUnit.WEEK, 2)))
        assertEquals(LocalDate.of(2026, 12, 7), PaywallDates.firstPaymentDate(today, PaywallPeriod(BillingPeriodUnit.MONTH, 1)))
        assertEquals(today, PaywallDates.firstPaymentDate(today, null))
    }

    @Test
    fun `the when line names the exact date from the period, and the year when it is not this year`() {
        val a = PaywallDates.whenLine(PaywallPeriod(BillingPeriodUnit.DAY, 7), today)
        assertEquals("First payment on November 14. Cancel before then and you pay nothing.", a.rest)
        val b = PaywallDates.whenLine(PaywallPeriod(BillingPeriodUnit.DAY, 20), today)
        assertEquals("First payment on November 27. Cancel before then and you pay nothing.", b.rest)
        val c = PaywallDates.whenLine(PaywallPeriod(BillingPeriodUnit.DAY, 60), today)
        assertTrue(c.rest.contains("January 6, 2027"), c.rest)
    }

    @Test
    fun `per month and the saving come from the product prices`() {
        val p = make(offer(null))
        val yearly = p.options.first { it.id == "yearly" }
        assertEquals("\$5.00 a month", yearly.perMonthLine)
        assertEquals("Save 44%", yearly.savingsLine)
        val other = make(offer(null, yearlyMicros = 96_000_000, monthlyMicros = 10_000_000, code = "EUR"))
        assertEquals("€8.00 a month", other.options.first { it.id == "yearly" }.perMonthLine)
        assertEquals("Save 20%", other.options.first { it.id == "yearly" }.savingsLine)
    }

    @Test
    fun `an unknown currency shows no invented per month figure`() {
        val line = PaywallPricing.perMonthLine(offer(null, code = null).first())
        assertEquals("per year", line)
    }

    @Test
    fun `yearly is selected first and a pick moves the selection`() {
        assertEquals("yearly", make(offer(null)).productId)
        assertEquals("monthly", make(offer(null), "monthly").productId)
        assertEquals(listOf("yearly", "monthly"), make(offer(null)).options.map { it.id })
    }

    @Test
    fun `the store's ISO trial period parses`() {
        assertEquals(PaywallPeriod(BillingPeriodUnit.DAY, 7), PaywallPeriod.parseIso("P7D"))
        assertEquals(PaywallPeriod(BillingPeriodUnit.WEEK, 2), PaywallPeriod.parseIso("P2W"))
        assertNull(PaywallPeriod.parseIso("P0D"))
        assertNull(PaywallPeriod.parseIso(null))
    }

    @Test
    fun `the example call is in the course language and the card never shows a generated handle`() {
        assertTrue(ProPaywallCopy.exampleCall(Course.SPANISH).reply.contains("cansado"))
        assertTrue(ProPaywallCopy.exampleCall(Course.FRENCH).reply.contains("faim"))
        assertEquals("Ana", ProPaywallCopy.cardFirstName("Ana Lopez"))
        assertNull(ProPaywallCopy.cardFirstName(null))
    }

    private val forbidden = listOf(
        "a price with a currency sign" to Regex("[$€£¥₹]\\s?\\d"),
        "a price amount" to Regex("\\d+[.,]\\d{2}"),
        "a currency code" to Regex("\\b(?:USD|EUR|GBP|CAD|AUD|JPY|INR|MXN|BRL|CHF)\\b"),
        "a trial or period length" to Regex("\\b\\d+(?:\\s|-)?(?:days?|weeks?|months?|years?)\\b", RegexOption.IGNORE_CASE),
        "a percentage" to Regex("\\d+\\s?%"),
        "a daily allowance" to Regex("\\b\\d+\\s*(?:messages?|minutes?|calls?)\\b", RegexOption.IGNORE_CASE),
    )

    private fun violations(texts: List<String>) = texts.flatMap { t -> forbidden.filter { it.second.containsMatchIn(t) }.map { "${it.first}: $t" } }

    /** The text inside every string literal of a Kotlin source, comments removed first. */
    private fun literals(source: String): List<String> {
        val noBlock = source.replace(Regex("/\\*[\\s\\S]*?\\*/"), "")
        val noLine = noBlock.replace(Regex("(?m)(^|[^:\"])//.*$"), "$1")
        return Regex("\"((?:[^\"\\\\]|\\\\.)*)\"").findAll(noLine).map { it.groupValues[1] }.toList()
    }

    @Test
    fun `the paywall copy and views type no price, currency or trial`() {
        assertEquals(emptyList<String>(), violations(ProPaywallCopy.allText))
        var dir: File? = File("").absoluteFile
        while (dir != null && !File(dir, "app/src/main").isDirectory) dir = dir.parentFile
        val view = File(dir, "app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/paywall/ProPaywallScreen.kt")
        val found = literals(view.readText())
        assertTrue(found.isNotEmpty(), "the paywall view was not read")
        assertEquals(emptyList<String>(), violations(found))
    }

    @Test
    fun `the scan catches what it claims to`() {
        for (bad in listOf("\$9.99 a month", "Save 33%", "7-day free trial", "USD", "20 minutes a day")) {
            assertFalse(violations(literals("Text(\"$bad\")")).isEmpty(), bad)
        }
    }
}
