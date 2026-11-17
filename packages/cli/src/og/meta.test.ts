import { describe, expect, it } from "vitest";
import { pageHtml } from "./meta.ts";

const BASE = `<!doctype html><html><head>
    <title>ラブリィメモリー</title>
    <meta name="description" content="site">
    <meta property="og:type" content="website">
    <meta property="og:title" content="ラブリィメモリー">
    <meta property="og:description" content="site">
    <meta property="og:url" content="https://example.com/">
    <meta property="og:image" content="https://example.com/og.png">
  </head><body><div id="root"></div></body></html>`;

describe("pageHtml", () => {
  it("replaces the site-wide meta with the page's", () => {
    const html = pageHtml(BASE, {
      title: "A & B",
      description: `「曲」"x"`,
      url: "https://example.com/a/songs/s1",
      image: "https://example.com/og/a/songs/s1.png",
    });
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html).toContain(`<meta name="description" content="「曲」&quot;x&quot;">`);
    expect(html).toContain(`<meta property="og:url" content="https://example.com/a/songs/s1">`);
    expect(html).toContain(`<meta property="og:image" content="https://example.com/og/a/songs/s1.png">`);
    expect(html).toContain(`<meta property="og:type" content="article">`);
    // 無かったタグは head の最後に足す
    expect(html).toMatch(/og:image:alt" content="A &amp; B">\s*<\/head>/);
    expect(html.match(/og:title/g)).toHaveLength(1);
    expect(html).toContain(`<div id="root"></div>`);
  });

  it("keeps the site image when the page has none", () => {
    const html = pageHtml(BASE, { title: "T", description: "D", url: "https://example.com/a" });
    expect(html).toContain(`<meta property="og:image" content="https://example.com/og.png">`);
    expect(html).toContain(`<meta property="og:type" content="website">`);
  });
});
