import { esc } from "./cards.ts";

export type PageMeta = {
  title: string;
  description: string;
  /** 絶対 URL */
  url: string;
  /** 絶対 URL。省略時はサイト共通の画像のまま */
  image?: string;
  imageAlt?: string;
};

function setMeta(html: string, attr: "name" | "property", key: string, value: string): string {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}">`;
  const re = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, "\\$&")}" content="[^"]*"\\s*/?>`);
  if (re.test(html)) return html.replace(re, () => tag);
  return html.replace("</head>", () => `    ${tag}\n  </head>`);
}

/**
 * ビルド済みの index.html（サイト共通の meta 入り）を、ページごとの内容に書き換える。
 * アプリ本体（script・CSS）はそのままなので、開けば普通に SPA として動く。
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
  return html;
}
