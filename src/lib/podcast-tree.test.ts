import { describe, expect, it } from "vitest";
import {
  buildFolderTree,
  episodeCourse,
  findCycle,
  isValidSlug,
  resolveFolderPath,
  slugPathFor,
  transcriptSaveCourse,
} from "./podcast-tree";

const f = (id: string, parentId: string | null, slug: string, sortOrder = 0) => ({
  id,
  parentId,
  slug,
  title: slug,
  description: null,
  sortOrder,
});

describe("buildFolderTree", () => {
  it("nests children under their parent, ordered by sortOrder", () => {
    const tree = buildFolderTree([f("b", "a", "b1", 2), f("a", null, "en"), f("c", "a", "c1", 1)]);
    expect(tree).toHaveLength(1);
    expect(tree[0].slug).toBe("en");
    expect(tree[0].children.map((c) => c.slug)).toEqual(["c1", "b1"]);
  });

  it("drops a child whose parent is missing rather than losing the whole tree", () => {
    const tree = buildFolderTree([f("a", null, "en"), f("orphan", "gone", "lost")]);
    expect(tree.map((n) => n.slug)).toEqual(["en"]);
  });
});

describe("resolveFolderPath", () => {
  it("walks a slug path of arbitrary depth", () => {
    const folders = [f("a", null, "en"), f("b", "a", "a1"), f("c", "b", "cafe")];
    expect(resolveFolderPath(folders, ["en", "a1", "cafe"])?.id).toBe("c");
  });

  it("returns null when a segment does not exist at that level", () => {
    const folders = [f("a", null, "en"), f("b", "a", "a1")];
    expect(resolveFolderPath(folders, ["en", "nope"])).toBeNull();
  });

  it("does not match a folder that exists elsewhere in the tree", () => {
    // "cafe" is a child of a1, not of en -- resolving en/cafe must fail.
    const folders = [f("a", null, "en"), f("b", "a", "a1"), f("c", "b", "cafe")];
    expect(resolveFolderPath(folders, ["en", "cafe"])).toBeNull();
  });
});

// Review Focus #2: a cycle makes tree rendering infinite-loop.
describe("findCycle", () => {
  it("returns null for an acyclic tree", () => {
    expect(findCycle([f("a", null, "en"), f("b", "a", "a1")])).toBeNull();
  });

  it("detects a folder parented to its own descendant", () => {
    const cycle = findCycle([f("a", "b", "en"), f("b", "a", "a1")]);
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("detects a folder parented to itself", () => {
    expect(findCycle([f("a", "a", "en")])).toEqual(["a"]);
  });
});

describe("slugPathFor", () => {
  it("walks a nested folder back up to its root, in root-to-leaf order", () => {
    const folders = [f("a", null, "en"), f("b", "a", "a1"), f("c", "b", "cafe")];
    expect(slugPathFor(folders, "c")).toEqual(["en", "a1", "cafe"]);
  });

  it("returns a single-element path for a root folder", () => {
    expect(slugPathFor([f("a", null, "en")], "a")).toEqual(["en"]);
  });

  it("returns null for an id that isn't in the list", () => {
    expect(slugPathFor([f("a", null, "en")], "missing")).toBeNull();
  });

  it("returns null rather than looping forever if the chain is cyclic", () => {
    // Should never happen (findCycle guards writes), but a reader of this
    // path's storage-key output deserves a null, not a hang.
    expect(slugPathFor([f("a", "b", "en"), f("b", "a", "a1")], "a")).toBeNull();
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase kebab-case", () => {
    expect(isValidSlug("cafe-orders-a1")).toBe(true);
  });

  it("rejects slugs that would break a URL path or a storage key", () => {
    for (const bad of ["Cafe", "a b", "a/b", "", "-lead", "trail-", "a--b", "é"]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});

describe("episodeCourse / transcriptSaveCourse", () => {
  const f = (id: string, parentId: string | null, course?: "en" | "fr" | "es" | null) => ({
    id,
    parentId,
    slug: id,
    title: id,
    description: null,
    sortOrder: 0,
    course,
  });
  const folders = [
    f("fr", null, "fr"),
    f("a1", "fr"),
    f("s", "a1"),
    f("any", null, null),
    f("x", "any"),
  ];

  it("reads the course from the root folder above the episode's folder", () => {
    expect(episodeCourse(folders, "s")).toBe("fr");
    expect(episodeCourse(folders, "fr")).toBe("fr");
  });

  it("is null for a root with no course, an unknown folder or a broken chain", () => {
    expect(episodeCourse(folders, "x")).toBeNull();
    expect(episodeCourse(folders, "nope")).toBeNull();
    expect(episodeCourse([f("orphan", "gone")], "orphan")).toBeNull();
    expect(episodeCourse([f("a", "b"), f("b", "a")], "a")).toBeNull();
  });

  it("falls back to the active course, not to English, when the episode's is unknown", () => {
    expect(transcriptSaveCourse(folders, "s", "en")).toBe("fr");
    expect(transcriptSaveCourse(folders, "x", "es")).toBe("es");
  });

  it("prefers the episode's own course over its folder's", () => {
    expect(transcriptSaveCourse(folders, "s", "en", "es")).toBe("es");
  });
});
