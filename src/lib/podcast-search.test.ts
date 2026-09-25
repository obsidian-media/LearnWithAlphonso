import { describe, expect, it } from "vitest";
import { buildIlikeOrFilter, escapeLikeValue, normalizeQuery } from "./podcast-search";

describe("normalizeQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeQuery("  ordering   coffee  ")).toBe("ordering coffee");
  });

  it("returns null for an empty or whitespace-only query", () => {
    expect(normalizeQuery("")).toBeNull();
    expect(normalizeQuery("   ")).toBeNull();
    expect(normalizeQuery("\n\t")).toBeNull();
  });

  it("returns null for a single character, which matches almost everything", () => {
    expect(normalizeQuery("a")).toBeNull();
    expect(normalizeQuery("ab")).toBe("ab");
  });

  it("caps a very long query rather than sending it to the database", () => {
    const long = "a".repeat(500);
    expect(normalizeQuery(long)!.length).toBe(100);
  });
});

describe("escapeLikeValue", () => {
  // % and _ are LIKE wildcards. Left alone, a learner searching for "50%"
  // silently gets a prefix match on "50" plus anything, and one searching
  // "a_b" matches "axb" -- wrong results that look plausible.
  it("escapes LIKE wildcards so they match literally", () => {
    expect(escapeLikeValue("50%")).toBe("50\\%");
    expect(escapeLikeValue("a_b")).toBe("a\\_b");
  });

  it("escapes the escape character itself, first", () => {
    // Otherwise the backslash added for a following % would be consumed as
    // an escape for the user's own backslash.
    expect(escapeLikeValue("a\\b")).toBe("a\\\\b");
    expect(escapeLikeValue("\\%")).toBe("\\\\\\%");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLikeValue("ordering coffee")).toBe("ordering coffee");
  });
});

describe("buildIlikeOrFilter", () => {
  it("searches title and description", () => {
    const filter = buildIlikeOrFilter("coffee", ["title", "description"]);
    expect(filter).toBe('title.ilike."%coffee%",description.ilike."%coffee%"');
  });

  // PostgREST uses commas to separate conditions and parentheses to group
  // them. An unquoted value containing either ends the condition early --
  // at best a failed request, at worst a filter that means something else.
  it("quotes the value so a comma cannot end the condition", () => {
    const filter = buildIlikeOrFilter("coffee, tea", ["title"]);
    expect(filter).toBe('title.ilike."%coffee, tea%"');
  });

  it("quotes a value containing parentheses", () => {
    expect(buildIlikeOrFilter("cafe (a1)", ["title"])).toBe('title.ilike."%cafe (a1)%"');
  });

  it("escapes a double quote inside the value so it cannot close the quoting", () => {
    expect(buildIlikeOrFilter('say "hello"', ["title"])).toBe('title.ilike."%say \\"hello\\"%"');
  });

  it("escapes LIKE wildcards inside the quoted value", () => {
    expect(buildIlikeOrFilter("50%", ["title"])).toBe('title.ilike."%50\\%%"');
  });

  it("returns null for a query that normalizes away", () => {
    expect(buildIlikeOrFilter("  ", ["title"])).toBeNull();
    expect(buildIlikeOrFilter("a", ["title"])).toBeNull();
  });

  it("returns null when given no columns to search", () => {
    expect(buildIlikeOrFilter("coffee", [])).toBeNull();
  });
});
