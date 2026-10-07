import { describe, expect, it } from "vitest";
import { candidateFrom, parsePexels, parsePixabay, pickPhoto, pixabaySearchUrl } from "./providers";

const pexels = {
  photos: [
    {
      id: 1,
      url: "https://www.pexels.com/photo/woman-beach-1/",
      photographer: "A",
      alt: "Woman in a bikini on the beach",
      width: 4000,
      height: 3000,
      src: { large2x: "https://images.pexels.com/photos/1/a.jpeg?w=1880" },
    },
    {
      id: 2,
      url: "https://www.pexels.com/photo/red-apple-2/",
      photographer: "B",
      alt: "A red apple",
      width: 500,
      height: 400,
      src: { large2x: "https://images.pexels.com/photos/2/b.jpeg?w=1880" },
    },
    {
      id: 3,
      url: "https://www.pexels.com/photo/green-apple-3/",
      photographer: "C",
      alt: null,
      width: 3000,
      height: 2000,
      src: { large2x: "https://images.pexels.com/photos/3/c.jpeg?w=1880" },
    },
  ],
};
const pixabay = {
  hits: [
    {
      id: 9,
      pageURL: "https://pixabay.com/photos/apple-fruit-9/",
      tags: "apple, fruit",
      user: "D",
      largeImageURL: "https://pixabay.com/get/g123_1280.jpg",
      imageWidth: 1920,
      imageHeight: 1280,
    },
    { id: "bad" },
  ],
};

describe("provider parsing", () => {
  it("parses Pexels into photos keyed by provider id", () => {
    const photos = parsePexels(pexels);
    expect(photos.map((p) => p.sourceId)).toEqual(["pexels:1", "pexels:2", "pexels:3"]);
    expect(photos[2]).toMatchObject({
      providerAlt: "",
      credit: "C",
      sourcePageUrl: "https://www.pexels.com/photo/green-apple-3/",
    });
  });

  it("parses Pixabay and skips malformed hits", () => {
    expect(parsePixabay(pixabay)).toEqual([
      {
        source: "pixabay",
        sourceId: "pixabay:9",
        sourcePageUrl: "https://pixabay.com/photos/apple-fruit-9/",
        credit: "D",
        providerAlt: "apple, fruit",
        downloadUrl: "https://pixabay.com/get/g123_1280.jpg",
        width: 1920,
        height: 1280,
      },
    ]);
    expect(parsePixabay(null)).toEqual([]);
  });

  it("asks Pixabay for safe search", () => {
    expect(pixabaySearchUrl("apple", "k")).toContain("safesearch=true");
  });
});

describe("pickPhoto", () => {
  it("skips denylisted alt text, too-small images and excluded photos", () => {
    const photos = parsePexels(pexels);
    expect(pickPhoto(photos, new Set())?.sourceId).toBe("pexels:3");
    expect(pickPhoto(photos, new Set(["pexels:3"]))).toBeNull();
  });
});

describe("candidateFrom", () => {
  it("never carries the provider download URL into the manifest", () => {
    const [hit] = parsePixabay(pixabay);
    const c = candidateFrom(hit, "staging/en/apple-0123abcd.jpg", "0123abcd", 700, 467);
    expect("downloadUrl" in c).toBe(false);
    expect(JSON.stringify(c)).not.toContain("pixabay.com/get");
  });
});
