import type { Plugin } from "vite";

const TITLE = "ラブリィメモリー";
const DESCRIPTION = "太陽と踊れ月夜に唄え（Second Season）のライブのセットリストを記録・集計する非公式ファンサイト。曲ごとの歌唱率や初披露、公演ごとのセトリを見られます。";

/**
 * SNS で共有されたときのカード（OGP / X）用の meta タグを index.html に入れる。
 * og:image・og:url は絶対 URL が必要なので、環境変数 SITE_URL（デプロイ時はリポジトリ変数）から作る。
 * 未設定のとき（ローカル開発など）はその 2 つを省く。
 */
export function ogMeta(): Plugin {
  return {
    name: "lovely-memory:og-meta",
    transformIndexHtml() {
      const raw = process.env.SITE_URL?.trim();
      const site = raw ? (raw.endsWith("/") ? raw : `${raw}/`) : undefined;
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
      return tags.map(([key, name, content]) => ({
        tag: "meta",
        attrs: { [key]: name, content },
        injectTo: "head" as const,
      }));
    },
  };
}
