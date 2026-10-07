import { describe, expect, it } from "vitest";
import { publicUrlFor, sha8Of, slugForTerm, storagePathFor } from "./paths";
import { parseVocabImageUrl } from "./url-policy";

describe("slugForTerm", () => {
  it("keeps plain lowercase ASCII words readable", () => {
    expect(slugForTerm("apple")).toBe("apple");
    expect(slugForTerm("ice cream")).toBe("ice-cream");
  });

  it("adds a content hash whenever the key is not plain, so slugs stay unique", () => {
    expect(slugForTerm("ice-cream")).toMatch(/^ice-cream-[0-9a-f]{8}$/);
    expect(slugForTerm("à bientôt")).toMatch(/^a-bientot-[0-9a-f]{8}$/);
    expect(slugForTerm("l'école")).toMatch(/^l-ecole-[0-9a-f]{8}$/);
    expect(slugForTerm("李")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("never maps two different keys to one slug", () => {
    const keys = ["ice cream", "ice-cream", "café", "cafe", "élève", "eleve", "niño", "nino", "a b", "a-b"];
    expect(new Set(keys.map(slugForTerm)).size).toBe(keys.length);
  });
});

describe("storagePathFor / publicUrlFor / sha8Of", () => {
  it("builds <lang>/<slug>.jpg", () => {
    expect(storagePathFor("pomme", "fr")).toBe("fr/pomme.jpg");
  });

  it("builds a URL the policy accepts", () => {
    const url = publicUrlFor(storagePathFor("pomme", "fr"), "0123abcd");
    expect(parseVocabImageUrl(url)).toEqual({ lang: "fr", slug: "pomme", version: "0123abcd" });
  });

  it("refuses a malformed version", () => {
    expect(() => publicUrlFor("fr/pomme.jpg", "XYZ")).toThrow(/version/);
  });

  it("hashes bytes to 8 lowercase hex chars, deterministically", () => {
    const a = sha8Of(new Uint8Array([1, 2, 3]));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(sha8Of(new Uint8Array([1, 2, 3]))).toBe(a);
    expect(sha8Of(new Uint8Array([1, 2, 4]))).not.toBe(a);
  });
});
