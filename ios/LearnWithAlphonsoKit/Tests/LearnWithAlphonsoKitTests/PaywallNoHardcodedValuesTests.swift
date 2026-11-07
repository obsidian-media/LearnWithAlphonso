import XCTest
@testable import LearnWithAlphonsoKit

/// Owner rule: the paywall never types in a price, a currency, the yearly saving, the trial or its length, or a number for
/// the daily allowance. They come from the store product for each learner. This scans the string literals of the paywall's
/// views, and the Kit's copy, for any of them (the web twin is src/lib/paywall-no-hardcoded-values.test.ts).
final class PaywallNoHardcodedValuesTests: XCTestCase {
    static let forbidden: [(what: String, pattern: String)] = [
        ("a price with a currency sign", #"[$€£¥₹]\s?\d"#),
        ("a price amount", #"\d+[.,]\d{2}"#),
        ("a currency code", #"\b(?:USD|EUR|GBP|CAD|AUD|JPY|INR|MXN|BRL|CHF)\b"#),
        ("a trial or period length", #"(?i)\b\d+(?:\s|-)?(?:days?|weeks?|months?|years?)\b"#),
        ("a percentage", #"\d+\s?%"#),
        ("a daily allowance", #"(?i)\b\d+\s*(?:messages?|minutes?|calls?)\b"#),
    ]

    private func repoRoot() -> URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url
    }

    /// The text inside every "…" string literal, with comments removed first.
    static func literals(in source: String) -> [String] {
        let noBlock = source.replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
        let noLine = noBlock.replacingOccurrences(of: #"(?m)(^|[^:"])//.*$"#, with: "$1", options: .regularExpression)
        var found: [String] = []
        var current: String?
        var escaped = false
        for ch in noLine {
            if current == nil {
                if ch == "\"" { current = "" }
            } else if escaped {
                current?.append(ch)
                escaped = false
            } else if ch == "\\" {
                escaped = true
            } else if ch == "\"" {
                found.append(current ?? "")
                current = nil
            } else {
                current?.append(ch)
            }
        }
        return found
    }

    static func violations(in texts: [String]) -> [String] {
        var found: [String] = []
        for text in texts {
            for rule in forbidden where text.range(of: rule.pattern, options: .regularExpression) != nil {
                found.append("\(rule.what): \(text)")
            }
        }
        return found
    }

    func testPaywallViewsTypeNoPriceCurrencyOrTrial() throws {
        let sources = ["PaywallView.swift", "ProPaywallParts.swift"]
        for name in sources {
            let url = repoRoot().appendingPathComponent("ios/LearnWithAlphonso/Sources/\(name)")
            let source = try String(contentsOf: url, encoding: .utf8)
            let literals = Self.literals(in: source)
            XCTAssertFalse(literals.isEmpty, "\(name) was not read")
            XCTAssertEqual(Self.violations(in: literals), [], name)
        }
    }

    func testKitPaywallCopyTypesNoPriceCurrencyOrTrial() {
        XCTAssertEqual(Self.violations(in: ProPaywallCopy.allText), [])
    }

    func testTheScanCatchesWhatItClaimsTo() {
        for bad in ["\"$9.99 a month\"", "\"Save 33%\"", "\"7-day free trial\"", "\"USD\"", "\"20 minutes a day\""] {
            XCTAssertFalse(Self.violations(in: Self.literals(in: "Text(\(bad))")).isEmpty, bad)
        }
    }
}
