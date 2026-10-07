import { describe, expect, it } from "vitest";
import {
  VOCAB_IMAGE_PUBLIC_BASE,
  isRenderableVocabImageUrl,
  isSourcePageUrl,
  parseVocabImageUrl,
} from "./url-policy";

const OK = `${VOCAB_IMAGE_PUBLIC_BASE}fr/pomme.jpg?v=0123abcd`;

describe("parseVocabImageUrl", () => {
  it("accepts a bucket URL and returns lang, slug and version", () => {
    expect(parseVocabImageUrl(OK)).toEqual({ lang: "fr", slug: "pomme", version: "0123abcd" });
  });

  it.each([
    [
      "an expiring Pixabay temp URL",
      "https://pixabay.com/get/g0e4cda1e9e154f066b2b2707a9ea8985fd48525527207960ec344a8aeeb296d9737c4ae2bfa9014cd6c825c462859c4c_640.jpg",
    ],
    [
      "a Pexels CDN URL",
      "https://images.pexels.com/photos/590472/pexels-photo-590472.jpeg?auto=compress&cs=tinysrgb&h=350",
    ],
    ["plain http", OK.replace("https://", "http://")],
    ["another bucket", OK.replace("/vocab-images/", "/podcast-audio/")],
    ["another project", OK.replace("qhcjpfbxfcltjbiuknyt", "abcdefghijklmnopqrst")],
    ["no version", OK.replace("?v=0123abcd", "")],
    ["an uppercase slug", OK.replace("pomme", "Pomme")],
    ["an unknown course folder", OK.replace("/fr/", "/de/")],
    ["an extra query parameter", `${OK}&x=1`],
    ["a non-jpg file", OK.replace(".jpg", ".png")],
  ])("rejects %s", (_label, url) => {
    expect(parseVocabImageUrl(url)).toBeNull();
    expect(isRenderableVocabImageUrl(url)).toBe(false);
  });
});

describe("isSourcePageUrl", () => {
  it("accepts provider photo pages", () => {
    expect(isSourcePageUrl("pexels", "https://www.pexels.com/photo/red-apple-590472/")).toBe(true);
    expect(isSourcePageUrl("pixabay", "https://pixabay.com/photos/guitar-music-1180744/")).toBe(true);
  });

  it("rejects download URLs and cross-provider pages", () => {
    expect(isSourcePageUrl("pixabay", "https://pixabay.com/get/gabc_640.jpg")).toBe(false);
    expect(isSourcePageUrl("pexels", "https://pixabay.com/photos/guitar-music-1180744/")).toBe(false);
    expect(isSourcePageUrl("pexels", "https://images.pexels.com/photos/590472/x.jpeg")).toBe(false);
  });
});
