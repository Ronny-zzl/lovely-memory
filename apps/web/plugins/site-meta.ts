import type { Plugin } from "vite";

const TITLE = "ラブリィメモリー";
const DESCRIPTION =
  "太陽と踊れ月夜に唄え（Second Season）のライブのセットリストを記録・集計する非公式ファンサイト。曲ごとの歌唱率や初披露、公演ごとのセトリを見られます。";

/**
 * サイトの URL に関わる head 要素を index.html に入れる。
 *
 * - 正式ドメイン以外（www.・pages.dev）で開かれたら、同じパスの正式ドメインへ移動する
 *   （Cloudflare Pages の _redirects はホスト名で振り分けられないため、ページ側で行う。
 *     プレビューデプロイ <hash>.<project>.pages.dev はそのまま使えるよう対象外）
 *
 * SNS で共有されたときのカード（OGP / X）用の meta タグを index.html に入れる。
 * og:image・og:url は絶対 URL が必要なので、環境変数 SITE_URL（デプロイ時はリポジトリ変数）から作る。
 * 未設定のとき（ローカル開発など）はその 2 つを省く。
 */
function siteUrl(): string | undefined {
  const raw = process.env.SITE_URL?.trim();
  return raw ? (raw.endsWith("/") ? raw : `${raw}/`) : undefined;
}

export function siteMeta(): Plugin {
  return {
    name: "lovely-memory:site-meta",
    // robots.txt が無いと SPA のフォールバックで index.html が返り、クローラーが HTML を robots.txt として読んでしまう。
    // sitemap.xml（デプロイ時に og-pages が書く）は絶対 URL で示す必要があるので、SITE_URL があるときだけ載せる
    generateBundle() {
      const site = siteUrl();
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: ["User-agent: *", "Allow: /", ...(site ? ["", `Sitemap: ${site}sitemap.xml`] : []), ""].join("\n"),
      });
    },
    transformIndexHtml() {
      const site = siteUrl();
      const tags: [string, string, string][] = [
        ["name", "description", DESCRIPTION],
        ["property", "og:type", "website"],
        ["property", "og:site_name", TITLE],
        ["property", "og:title", TITLE],
        ["property", "og:description", DESCRIPTION],
        ["property", "og:locale", "ja_JP"],
        ["name", "twitter:card", "summary_large_image"],
      ];
      if (site) {
        tags.push(
          ["property", "og:url", site],
          ["property", "og:image", `${site}og.png`],
          ["property", "og:image:width", "1200"],
          ["property", "og:image:height", "630"],
          ["property", "og:image:alt", "ラブリィメモリー — 太陽と踊れ月夜に唄え Second Season のセットリスト記録・集計"],
        );
      }
      const meta = tags.map(([key, name, content]) => ({
        tag: "meta",
        attrs: { [key]: name, content },
        injectTo: "head" as const,
      }));
      if (!site) return meta;
      const canonical = new URL(site);
      const aliases = [`www.${canonical.hostname}`, process.env.PAGES_HOST?.trim()].filter((h) => h && h !== canonical.hostname);
      const redirect = {
        tag: "script",
        children: `if(${JSON.stringify(aliases)}.includes(location.hostname))location.replace(${JSON.stringify(canonical.origin)}+location.pathname+location.search+location.hash)`,
        injectTo: "head-prepend" as const,
      };
      return [redirect, ...meta];
    },
  };
}
