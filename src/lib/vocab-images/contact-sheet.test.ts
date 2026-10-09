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

describe("buildContactSheetHtml sections", () => {
  const sectioned: SheetItem[] = [
    { ...items[0], section: "English", gloss: "a <b>", license: "Pexels License" },
    { ...items[0], key: "tree", section: "English" },
    { ...items[1], section: "French" },
  ];

  it("groups consecutive items under one heading each, with their counts", () => {
    const html = buildContactSheetHtml({ title: "t", items: sectioned, objections: false });
    expect(html.match(/<h2>/g)).toHaveLength(2);
    expect(html).toContain("<h2>English <small>2 images</small></h2>");
    expect(html).toContain("<h2>French <small>1 images</small></h2>");
    expect(html.match(/<div class="grid">/g)).toHaveLength(2);
    expect(html.match(/<figure /g)).toHaveLength(3);
    expect(html.match(/<\/div>/g)).toHaveLength(2);
  });

  it("shows the gloss and the licence line, escaped", () => {
    const html = buildContactSheetHtml({ title: "t", items: sectioned, objections: false });
    expect(html).toContain("Means: a &lt;b&gt;");
    expect(html).toContain("· Pexels License");
  });

  it("adds no heading when no item has a section", () => {
    expect(buildContactSheetHtml({ title: "t", items, objections: false })).not.toContain("<h2>");
  });
});
