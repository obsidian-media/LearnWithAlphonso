import { describe, expect, it } from "vitest";
import { buildContactSheetHtml, type SheetItem } from "./contact-sheet";

const items: SheetItem[] = [
  {
    key: 'he said "hi"',
    lang: "en",
    imgSrc: "../staging/en/a.jpg",
    alt: "<script>alert(1)</script>",
    credit: "Jane & Co",
    sourcePageUrl: "https://www.pexels.com/photo/a-1/",
  },
  {
    key: "pomme",
    lang: "fr",
    imgSrc: "../staging/fr/pomme.jpg",
    alt: "An apple.",
    credit: "B",
    sourcePageUrl: "https://pixabay.com/photos/apple-9/",
    note: "query: apple",
  },
];

describe("buildContactSheetHtml", () => {
  it("escapes every interpolated value", () => {
    const html = buildContactSheetHtml({ title: "Batch r1-b001", items, objections: false });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("he said &quot;hi&quot;");
    expect(html).toContain("Jane &amp; Co");
  });

  it("renders one numbered card per item with its image, language and note", () => {
    const html = buildContactSheetHtml({ title: "Batch r1-b001", items, objections: false });
    expect(html.match(/<figure /g)).toHaveLength(2);
    expect(html).toContain('src="../staging/fr/pomme.jpg"');
    expect(html).toContain("#2 · fr · pomme");
    expect(html).toContain("query: apple");
  });

  it("adds the owner objection controls only when asked", () => {
    expect(buildContactSheetHtml({ title: "t", items, objections: false })).not.toContain(
      'class="objection"',
    );
    const owner = buildContactSheetHtml({ title: "t", items, objections: true });
    expect(owner).toContain('class="objection"');
    expect(owner).toContain("Copy objections");
  });
});
