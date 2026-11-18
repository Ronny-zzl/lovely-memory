import { mkdir, writeFile } from "node:fs/promises";
import YAML from "yaml";
import {
  findSong,
  Setlist,
  type ParsedStage,
  type ResolvedEvent,
  type SetlistItem,
  type SetlistStage,
  type Song,
} from "@lovely-memory/core";
import { artistPath } from "./repo.ts";
import { nextSongId } from "./songs-merge.ts";

/**
 * 告知文の末尾タグのうち、記録しないもの。
 * - 新曲・初披露：集計で算出する
 * - 撮影可（動画撮影可能曲・撮影OK など）：告知に書かれたり書かれなかったりで記録として揃わない
 */
export const IGNORED_TAGS = /^(新曲|初披露|new|.*撮影.*(可|OK|ok|ＯＫ).*)$/i;

export type BuildResult = {
  /** unknown が空のときだけ存在する */
  setlist?: Setlist;
  /** songs.json と照合できなかった曲名（告知文の表記） */
  unknown: string[];
  warnings: string[];
  /** songs（引数）を書き換えたか。呼び出し側で songs.json を保存する */
  songsChanged: boolean;
};

/**
 * 解析済みの告知文を songs.json と照合して Setlist を作る。
 * - 告知文のクレジットは songs.json の空き項目だけ埋める（食い違いは警告）
 * - addUnknown のとき、照合できない曲を songs に追加する
 */
export function buildSetlist(
  parsed: ParsedStage[],
  songs: Song[],
  opts: { eventId: number; source?: string; addUnknown?: boolean },
): BuildResult {
  const unknown: string[] = [];
  const warnings: string[] = [];
  let songsChanged = false;

  const resolveItem = (p: ParsedStage["items"][number]): SetlistItem => {
    let song: Song | undefined = findSong(songs, p);
    if (!song && opts.addUnknown) {
      song = {
        id: nextSongId(songs),
        title: p.title,
        aliases: [],
        tieups: [],
        credits: Object.keys(p.credits).length ? p.credits : undefined,
      };
      songs.push(song);
      songsChanged = true;
      warnings.push(`曲を追加しました: ${song.id} ${song.title}（era / unit / cover は songs.json で補ってください）`);
    }
    if (!song) {
      unknown.push(p.label);
      return p.title;
    }
    for (const [k, v] of Object.entries(p.credits) as [keyof NonNullable<Song["credits"]>, string][]) {
      const cur = song.credits?.[k];
      if (!cur) {
        song.credits = { ...song.credits, [k]: v };
        songsChanged = true;
      } else if (cur !== v) {
        warnings.push(`クレジット不一致 ${song.title} ${k}: songs.json「${cur}」/ 告知「${v}」`);
      }
    }
    const note = p.tags.filter((t) => !IGNORED_TAGS.test(t)).join(" / ") || undefined;
    return p.encore || note ? { song: song.title, ...(p.encore && { encore: true }), ...(note && { note }) } : song.title;
  };

  const stages: SetlistStage[] = parsed.map((s) => ({
    ...(s.name && { name: s.name }),
    ...(s.note && { note: s.note }),
    items: s.items.map(resolveItem),
  }));
  if (unknown.length) return { unknown, warnings, songsChanged };

  const setlist = Setlist.parse({
    event: opts.eventId,
    ...(opts.source && { source: opts.source }),
    // ステージが 1 つならステージの補足はセトリ全体の note にする
    ...(stages.length === 1 && stages[0]!.note && { note: stages[0]!.note }),
    ...(stages.length === 1 ? { items: stages[0]!.items } : { stages }),
  });
  return { setlist, unknown, warnings, songsChanged };
}

export function setlistPath(artistId: string, eventId: number): string {
  return artistPath(artistId, "setlists", `${eventId}.yaml`);
}

export async function writeSetlist(artistId: string, setlist: Setlist, event: ResolvedEvent): Promise<string> {
  const doc = new YAML.Document(setlist);
  doc.commentBefore = ` ${event.date} ${event.title}`;
  await mkdir(artistPath(artistId, "setlists"), { recursive: true });
  const path = setlistPath(artistId, event.id);
  await writeFile(path, doc.toString({ lineWidth: 0 }), "utf8");
  return path;
}

export const countSongs = (s: Setlist) => (s.stages ?? [{ items: s.items ?? [] }]).reduce((n, st) => n + st.items.length, 0);
