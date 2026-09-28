import { describe, expect, it } from "vitest";
import {
  buildFolderTree,
  findCycle,
  isValidSlug,
  resolveFolderPath,
  slugPathFor,
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
