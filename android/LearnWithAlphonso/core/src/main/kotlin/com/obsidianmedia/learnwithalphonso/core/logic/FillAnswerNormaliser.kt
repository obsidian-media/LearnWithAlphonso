package com.obsidianmedia.learnwithalphonso.core.logic

import java.text.Normalizer
import java.util.Locale

/**
 * Port of `normaliseFillAnswer` (src/lib/srs.ts), step for step and in the same order, so a fill-in, reorder or
 * listening answer is judged the way the web and the server judge it; tests/fixtures/grading-parity.json pins both.
 * Used ONLY for those three question types: the speak and translate normalisers are separate.
 */
fun normaliseFillAnswer(value: String): String {
    // 1. NFC
    var s = Normalizer.normalize(value, Normalizer.Form.NFC)
    // 2. Apostrophe look-alikes become '
    s = s.replace(APOSTROPHE_LOOK_ALIKES, "'")
    // 3. Any run of Unicode whitespace (the JavaScript \s set, including no-break space) becomes one space
    s = s.replace(WHITESPACE_RUN, " ")
    // 4. Spaces hugging an apostrophe go
    s = s.replace(SPACE_AROUND_APOSTROPHE, "'")
    // 5. Trim (the same whitespace set), 6. lowercase
    s = s.trim { isJavaScriptWhitespace(it) }
    return s.lowercase(Locale.ROOT)
}

// Java's \s is ASCII-only, so the JavaScript \s set is spelled out.
private const val JS_WHITESPACE = "\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF"
private val APOSTROPHE_LOOK_ALIKES = Regex("[\u2018\u2019\u201A\u201B\u02BC\u02B9\u2032\u00B4\u0060\uFF07]")
private val WHITESPACE_RUN = Regex("[$JS_WHITESPACE]+")
private val SPACE_AROUND_APOSTROPHE = Regex(" ?' ?")

private fun isJavaScriptWhitespace(c: Char): Boolean =
    c in '\u0009'..'\u000D' || c == ' ' || c == ' ' || c == ' ' || c in ' '..' ' ||
        c == ' ' || c == ' ' || c == ' ' || c == ' ' || c == '　' || c == '﻿'
