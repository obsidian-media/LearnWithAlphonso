import XCTest
@testable import LearnWithAlphonsoKit

/// Ported from src/lib/podcast-search.test.ts -- same cases, same values, so
/// drift between the two implementations is visible in review.
final class PodcastSearchTests: XCTestCase {
    // MARK: - normalizeQuery

    func testTrimsAndCollapsesWhitespace() {
        XCTAssertEqual(PodcastSearch.normalizeQuery("  ordering   coffee  "), "ordering coffee")
    }

    func testReturnsNilForAnEmptyOrWhitespaceOnlyQuery() {
        XCTAssertNil(PodcastSearch.normalizeQuery(""))
        XCTAssertNil(PodcastSearch.normalizeQuery("   "))
        XCTAssertNil(PodcastSearch.normalizeQuery("\n\t"))
    }

    func testReturnsNilForASingleCharacterWhichMatchesAlmostEverything() {
        XCTAssertNil(PodcastSearch.normalizeQuery("a"))
        XCTAssertEqual(PodcastSearch.normalizeQuery("ab"), "ab")
    }

    func testCapsAVeryLongQuery() {
        let long = String(repeating: "a", count: 500)
        XCTAssertEqual(PodcastSearch.normalizeQuery(long)?.count, 100)
    }

    // MARK: - escapeLikeValue

    // % and _ are LIKE wildcards. Left alone, searching "50%" silently
    // becomes a prefix match on "50" plus anything.
    func testEscapesLikeWildcards() {
        XCTAssertEqual(PodcastSearch.escapeLikeValue("50%"), "50\\%")
        XCTAssertEqual(PodcastSearch.escapeLikeValue("a_b"), "a\\_b")
    }

    // The backslash must be escaped FIRST, or the one added in front of a
    // later % is consumed as the escape for the user's own backslash.
    func testEscapesTheEscapeCharacterFirst() {
        XCTAssertEqual(PodcastSearch.escapeLikeValue("a\\b"), "a\\\\b")
        XCTAssertEqual(PodcastSearch.escapeLikeValue("\\%"), "\\\\\\%")
    }

    func testLeavesOrdinaryTextUntouched() {
        XCTAssertEqual(PodcastSearch.escapeLikeValue("ordering coffee"), "ordering coffee")
    }

    // MARK: - ilikeOrFilter

    func testBuildsAFilterOverEveryColumn() {
        XCTAssertEqual(
            PodcastSearch.ilikeOrFilter(query: "coffee", columns: ["title", "description"]),
            "title.ilike.\"%coffee%\",description.ilike.\"%coffee%\""
        )
    }

    // PostgREST separates conditions with commas and groups with parens, so
    // an unquoted value containing either ends the condition early.
    func testQuotesTheValueSoACommaCannotEndTheCondition() {
        XCTAssertEqual(
            PodcastSearch.ilikeOrFilter(query: "coffee, tea", columns: ["title"]),
            "title.ilike.\"%coffee, tea%\""
        )
    }

    func testEscapesADoubleQuoteInsideTheValue() {
        XCTAssertEqual(
            PodcastSearch.ilikeOrFilter(query: "say \"hello\"", columns: ["title"]),
            "title.ilike.\"%say \\\"hello\\\"%\""
        )
    }

    func testReturnsNilForAQueryThatNormalizesAway() {
        XCTAssertNil(PodcastSearch.ilikeOrFilter(query: "  ", columns: ["title"]))
        XCTAssertNil(PodcastSearch.ilikeOrFilter(query: "a", columns: ["title"]))
    }

    func testReturnsNilWhenGivenNoColumns() {
        XCTAssertNil(PodcastSearch.ilikeOrFilter(query: "coffee", columns: []))
    }

    // MARK: - URL encoding

    // A hazard the web side does not have: supabase-js encodes the query for
    // us, but PodcastClient assigns `percentEncodedQuery` directly. An
    // unencoded `%` in a URL query is a percent-escape introducer, so a
    // search for "50%" could decode into something else entirely -- the same
    // "plausible result for the wrong query" failure in a new place.
    func testPercentEncodesTheFilterForAURLQuery() {
        let filter = PodcastSearch.ilikeOrFilter(query: "50% off", columns: ["title"])!
        let encoded = PodcastSearch.percentEncodedFilter(filter)
        // The literal % the user typed must survive as %25. Left raw it would
        // be read as the start of an escape sequence.
        XCTAssertTrue(encoded.contains("%25"), "a literal % must be encoded as %25")
        // Nothing that would terminate or reshape the URL query may survive
        // raw. (The encoded form contains sequences like %22 and %2C -- that
        // is the encoding working, not a leak.)
        for raw in [" ", "\"", ","] {
            XCTAssertFalse(encoded.contains(raw), "raw \(raw) would break the URL query")
        }
    }

    func testEncodingRoundTripsBackToTheOriginalFilter() {
        // The strongest statement available without a live PostgREST: whatever
        // encoding is applied, the server must see exactly what was built.
        let filter = PodcastSearch.ilikeOrFilter(
            query: "cafe (a1), 50% \"x\"",
            columns: ["title", "description"]
        )!
        let encoded = PodcastSearch.percentEncodedFilter(filter)
        XCTAssertEqual(encoded.removingPercentEncoding, filter)
    }
}
