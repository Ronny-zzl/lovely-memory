/*
 * イベントのセトリを、X などに貼るための文字にする（イベントのページの「セトリをコピー」）。
 */
import { displayTitle, formatDate } from "./format.ts";
import { isDance } from "./setlist.ts";
import type { ArtistConfig } from "./schema.ts";
import type { EventSetlist, SetlistEntry } from "./stats.ts";

/** ハッシュタグは artist.json の setlistHashtags（無ければ shareHashtags）。文字数を取るので URL は付けない */
export function setlistPostText(artist: ArtistConfig, setlist: EventSetlist): string {
  const { event } = setlist;
  const name = (id: string) => artist.members.find((m) => m.id === id)?.name ?? id;

  const line = (e: SetlistEntry) => {
    // イベントの出演メンバーと違う曲（一部のメンバーだけ・コラボなど）は、歌ったメンバーを添える（サイトと同じ条件）
    const partial = e.members.length !== event.members.length || e.members.some((m) => !event.members.includes(m));
    const who = [partial ? e.members.map(name).join("・") : "", e.with?.length ? `with ${e.with.join("・")}` : ""]
      .filter(Boolean)
      .join(" ");
    const extra = [isDance(e.song) ? "ダンス" : "", who, e.note ?? ""].filter(Boolean).join("／");
    return `${e.no} ${e.song.title}${extra ? `（${extra}）` : ""}`;
  };

  const blocks = setlist.stages.map((st) => {
    const lines: string[] = [];
    // 名前のあるステージ（コラボステージ・第 2 部など）は見出しを付ける
    if (st.name) lines.push(`【${st.name}】`);
    // 曲名を思い出せない曲（"?"）は曲順の番号だけ空いているので、その番号に「？」を入れる
    let next = 1;
    for (const e of st.entries) {
      const m = /^M(\d+)$/.exec(e.no);
      if (m) {
        for (; next < Number(m[1]); next++) lines.push(`M${next} ？`);
        next = Number(m[1]) + 1;
      }
      lines.push(line(e));
    }
    return lines.join("\n");
  });

  const notes = [
    setlist.completeness === "partial" || setlist.unknownSongs > 0 ? "※一部の曲だけの記録です" : "",
    setlist.completeness === "unordered" ? "※曲順は分かっていません" : "",
  ].filter(Boolean);
  const tags = (artist.setlistHashtags ?? artist.shareHashtags).map((h) => `#${h}`).join(" ");

  return [
    [`${formatDate(event.date)} ${artist.name}`, displayTitle(event.title, artist.name)].join("\n"),
    blocks.join("\n\n"),
    notes.join("\n"),
    tags,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * X での文字数（上限 280）。日本語などは 1 文字 2、URL は長さによらず 23 として数える
 * （twitter-text の重み付けの近似：U+0000–U+10FF・一般句読点などの範囲は 1）
 */
export function xTextLength(text: string): number {
  let n = 0;
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  const rest = urls.reduce((t, u) => t.replace(u, ""), text);
  for (const ch of rest) {
    const c = ch.codePointAt(0)!;
    const light = c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037);
    n += light ? 1 : 2;
  }
  return n + urls.length * 23;
}

export const X_TEXT_LIMIT = 280;
