import { describe, expect, it } from "vitest";
import { breadcrumbs, pageHtml, sitemap } from "./meta.ts";

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
    expect(html).toMatch(/og:image:alt" content="A &amp; B">\s*<link rel="canonical"[^>]*>\s*<\/head>/);
    expect(html.match(/og:title/g)).toHaveLength(1);
    expect(html).toContain(`<div id="root"></div>`);
  });

  it("keeps the site image when the page has none", () => {
    const html = pageHtml(BASE, { title: "T", description: "D", url: "https://example.com/a" });
    expect(html).toContain(`<meta property="og:image" content="https://example.com/og.png">`);
    expect(html).toContain(`<meta property="og:type" content="website">`);
  });
});

describe("pageHtml の canonical と構造化データ", () => {
  it("canonical を入れ、作り直しても 1 つのまま", () => {
    const once = pageHtml(BASE, { title: "T", description: "D", url: "https://example.com/a/songs" });
    expect(once).toContain(`<link rel="canonical" href="https://example.com/a/songs">`);
    const twice = pageHtml(once, { title: "T", description: "D", url: "https://example.com/b" });
    expect(twice.match(/rel="canonical"/g)).toHaveLength(1);
    expect(twice).toContain(`href="https://example.com/b"`);
  });

  it("JSON-LD を入れ、</script> で閉じられないよう < をエスケープする", () => {
    const html = pageHtml(BASE, {
      title: "T",
      description: "D",
      url: "https://example.com/a",
      structuredData: [breadcrumbs([{ name: "</script><b>", url: "https://example.com/" }])],
    });
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(json).toBeDefined();
    expect(json).not.toContain("<");
    expect(JSON.parse(json!)).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [{ "@type": "ListItem", position: 1, name: "</script><b>", item: "https://example.com/" }],
    });
    // 作り直すと置き換わる（増えない）・無ければ消える
    expect(pageHtml(html, { title: "T", description: "D", url: "https://example.com/a" })).not.toContain("ld+json");
  });
});

describe("sitemap", () => {
  it("URL を並べ、XML の特殊文字をエスケープする", () => {
    const xml = sitemap([{ url: "https://example.com/" }, { url: "https://example.com/a?x=1&y=2" }]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<url><loc>https://example.com/</loc></url>");
    expect(xml).toContain("<loc>https://example.com/a?x=1&amp;y=2</loc>");
  });

  it("lastmod があれば添える", () => {
    const xml = sitemap([{ url: "https://example.com/a", lastmod: "2026-11-23" }]);
    expect(xml).toContain("<url><loc>https://example.com/a</loc><lastmod>2026-11-23</lastmod></url>");
  });
});
