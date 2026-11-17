import * as cheerio from "cheerio";
import { parseCredits } from "@lovely-memory/core";
import type { DiscographyAdapter, OfficialTrack } from "./types";
import type { ReleaseKind } from "../../wikipedia";

const INSTRUMENTAL = /[(（]\s*(instrumental|off\s*vocal|inst\.?)\s*[)）]/i;

function kindFromTag(tag: string): ReleaseKind {
  if (/digital|配信/i.test(tag)) return "digital";
  if (/\bEP\b/i.test(tag)) return "ep";
  if (/album|アルバム/i.test(tag)) return "album";
  if (/single|シングル/i.test(tag)) return "single";
  return "other";
}

/** ディスコグラフィ一覧から作品詳細ページ（/discography/<category>/<slug>/）の URL を集める */
export function parseIndex(html: string, indexUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(indexUrl);
  const urls = new Set<string>();
  $("a[href]").each((_, a) => {
    const u = new URL($(a).attr("href")!, base);
    const rest = decodeURIComponent(u.pathname).slice(decodeURIComponent(base.pathname).length);
    if (u.host === base.host && /^[^/]+\/[^/]+\/$/.test(rest) && !rest.startsWith("feed/")) {
      urls.add(u.href);
    }
  });
  return [...urls];
}

/** 作品詳細ページから収録曲を取り出す */
export function parseRelease(html: string, url: string): OfficialTrack[] {
  const $ = cheerio.load(html);
  const tag = $(".meta-tag").first().text().trim();
  const dateText = $(".meta-date").first().text().trim();
  const m = dateText.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  const releaseTitle = $("h1.discography-title").first().text().trim();
  if (!m || !releaseTitle) throw new Error(`unexpected release page: ${url}`);
  const release = {
    date: `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`,
    title: releaseTitle,
    kind: kindFromTag(tag),
    url,
  };
  const unitLabel = $(".discography-category").first().text().trim() || undefined;

  const tracks: OfficialTrack[] = [];
  $("ol.discography-songs > li").each((_, li) => {
    const title = $(li).find(".title").text().trim();
    if (!title || INSTRUMENTAL.test(title)) return;
    // <br> を改行として残したままタグ・実体参照を外す
    const creditHtml = ($(li).find(".text").html() ?? "").replace(/<br\s*\/?>/gi, "\n");
    tracks.push({ title, credits: parseCredits(cheerio.load(creditHtml).text()), unitLabel, release });
  });
  // 配信シングルなどで曲目リストが無い場合は作品名＝曲名とみなす
  if (tracks.length === 0) tracks.push({ title: releaseTitle, credits: {}, unitLabel, release });
  return tracks;
}

export const taiyotsukiyo: DiscographyAdapter = async (indexUrl, fetchHtml) => {
  const pages = parseIndex(await fetchHtml(indexUrl), indexUrl);
  const tracks: OfficialTrack[] = [];
  for (const url of pages) tracks.push(...parseRelease(await fetchHtml(url), url));
  return tracks;
};
