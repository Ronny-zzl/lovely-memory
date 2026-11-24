import { esc } from "./cards.ts";

export type PageMeta = {
  title: string;
  description: string;
  /** 絶対 URL */
  url: string;
  /** 絶対 URL。省略時はサイト共通の画像のまま */
  image?: string;
  imageAlt?: string;
  /** 検索エンジン向けの構造化データ（JSON-LD。schema.org） */
  structuredData?: object[];
};

/** sitemap.xml の 1 件 */
export type SitemapEntry = {
  /** 絶対 URL */
  url: string;
  /** 中身が最後に変わった日（YYYY-MM-DD） */
  lastmod?: string;
};

/** パンくず（BreadcrumbList）。検索結果に「サイト › 楽曲 › 曲名」の形で出る */
export function breadcrumbs(items: Array<{ name: string; url: string }>): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
  };
}

function setMeta(html: string, attr: "name" | "property", key: string, value: string): string {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}">`;
  const re = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, "\\$&")}" content="[^"]*"\\s*/?>`);
  if (re.test(html)) return html.replace(re, () => tag);
  return html.replace("</head>", () => `    ${tag}\n  </head>`);
}

function setCanonical(html: string, url: string): string {
  const tag = `<link rel="canonical" href="${esc(url)}">`;
  const re = /<link rel="canonical" href="[^"]*"\s*\/?>/;
  if (re.test(html)) return html.replace(re, () => tag);
  return html.replace("</head>", () => `    ${tag}\n  </head>`);
}

/** JSON-LD を </script> で閉じられないよう、< をエスケープして埋め込む */
function setStructuredData(html: string, data: object[]): string {
  const without = html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
  if (data.length === 0) return without;
  const json = JSON.stringify(data.length === 1 ? data[0] : data).replace(/</g, "\\u003c");
  return without.replace("</head>", () => `    <script type="application/ld+json">${json}</script>\n  </head>`);
}

/**
 * ビルド済みのページの HTML（サイト共通の meta 入り）の meta を、ページごとの内容に書き換える。
 * 正規の URL（canonical）と構造化データも入れる。中身（#root）・script・CSS はそのまま。
 */
export function pageHtml(base: string, m: PageMeta): string {
  let html = base.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(m.title)}</title>`);
  html = setMeta(html, "name", "description", m.description);
  html = setMeta(html, "property", "og:title", m.title);
  html = setMeta(html, "property", "og:description", m.description);
  html = setMeta(html, "property", "og:url", m.url);
  html = setMeta(html, "property", "og:type", m.image ? "article" : "website");
  if (m.image) {
    html = setMeta(html, "property", "og:image", m.image);
    html = setMeta(html, "property", "og:image:alt", m.imageAlt ?? m.title);
  }
  // 別のホスト（pages.dev）・絞り込みのクエリ付きなどで開かれても、検索エンジンにはこの URL の 1 ページとして扱わせる
  html = setCanonical(html, m.url);
  return setStructuredData(html, m.structuredData ?? []);
}

/** 検索エンジン向けのページ一覧（sitemap.xml） */
export function sitemap(entries: SitemapEntry[]): string {
  const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries.map((e) => `  <url><loc>${xml(e.url)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`),
    `</urlset>`,
    "",
  ].join("\n");
}
