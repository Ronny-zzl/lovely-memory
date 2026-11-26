/*
 * 曲 ⇄ 曲の情報の入力画面（下書き。文字列だけの形）⇄ 送る内容（SongEditPayload）。ブラウザでも使うので zod は使わない。
 * 曲を開いてそのまま保存し直しても変わらないこと（apply-edit.test.ts でリポジトリの全曲を確かめる）。
 */
import type { Song, Tieup } from "./schema.ts";
import type { SongEditPayload } from "./song-edit.ts";

export type ReleaseKind = NonNullable<Song["release"]>["kind"];
export type TieupType = Tieup["type"];

export type TieupDraft = { type: TieupType; work: string; role: string; url: string };

export type SongDraft = {
  lyrics: string;
  music: string;
  arrangement: string;
  releaseDate: string;
  releaseTitle: string;
  releaseKind: ReleaseKind;
  releaseUrl: string;
  /** カバー曲のときだけ使う */
  coverArtist: string;
  coverTitle: string;
  coverReleaseDate: string;
  coverReleaseTitle: string;
  coverReleaseUrl: string;
  tieups: TieupDraft[];
  /** 1 行に 1 つ */
  aliases: string;
  note: string;
};

export const emptyTieup = (): TieupDraft => ({ type: "anime", work: "", role: "", url: "" });

export function songToDraft(song: Song): SongDraft {
  return {
    lyrics: song.credits?.lyrics ?? "",
    music: song.credits?.music ?? "",
    arrangement: song.credits?.arrangement ?? "",
    releaseDate: song.release?.date ?? "",
    releaseTitle: song.release?.title ?? "",
    releaseKind: song.release?.kind ?? "single",
    releaseUrl: song.release?.url ?? "",
    coverArtist: song.cover?.artist ?? "",
    coverTitle: song.cover?.title ?? "",
    coverReleaseDate: song.cover?.release?.date ?? "",
    coverReleaseTitle: song.cover?.release?.title ?? "",
    coverReleaseUrl: song.cover?.release?.url ?? "",
    tieups: song.tieups.map((t) => ({ type: t.type, work: t.work, role: t.role ?? "", url: t.url ?? "" })),
    aliases: song.aliases.join("\n"),
    note: song.note ?? "",
  };
}

/** 空の項目は送らない（undefined）。前後の空白は除く */
const v = (s: string) => s.trim() || undefined;

/** 入力の足りないところ（発売日があるのに作品名が無い、など）。保存の前に画面に出す */
export function songDraftProblems(d: SongDraft): string[] {
  const out: string[] = [];
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (v(d.releaseDate) || v(d.releaseTitle)) {
    if (!date.test(d.releaseDate.trim())) out.push("発売日を YYYY-MM-DD で入れてください");
    if (!v(d.releaseTitle)) out.push("収録作品を入れてください");
  }
  if (v(d.coverReleaseDate) && !date.test(d.coverReleaseDate.trim())) out.push("原曲の発売日を YYYY-MM-DD で入れてください");
  if ((v(d.coverTitle) || v(d.coverReleaseDate) || v(d.coverReleaseTitle)) && !v(d.coverArtist))
    out.push("原曲のアーティストを入れてください");
  if (v(d.coverReleaseTitle) && !v(d.coverReleaseDate)) out.push("原曲の発売日を入れてください");
  if (d.tieups.some((t) => !v(t.work) && (v(t.role) || v(t.url)))) out.push("タイアップの作品名を入れてください");
  return out;
}

export function songDraftToPayload(d: SongDraft, artist: string, id: string): SongEditPayload {
  const credits = { lyrics: v(d.lyrics), music: v(d.music), arrangement: v(d.arrangement) };
  const coverRelease = v(d.coverReleaseDate)
    ? { date: d.coverReleaseDate.trim(), title: v(d.coverReleaseTitle), url: v(d.coverReleaseUrl) }
    : undefined;
  return {
    type: "song",
    artist,
    id,
    credits: Object.values(credits).some(Boolean) ? credits : undefined,
    release: v(d.releaseDate)
      ? { date: d.releaseDate.trim(), title: d.releaseTitle.trim(), kind: d.releaseKind, url: v(d.releaseUrl) }
      : undefined,
    cover: v(d.coverArtist) ? { artist: d.coverArtist.trim(), title: v(d.coverTitle), release: coverRelease } : undefined,
    tieups: d.tieups.filter((t) => v(t.work)).map((t) => ({ type: t.type, work: t.work.trim(), role: v(t.role), url: v(t.url) })),
    aliases: [
      ...new Set(
        d.aliases
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    note: v(d.note),
  };
}

/** songs.json での項目の順（schema.ts の Song と同じ）。書き換えても項目の順が変わらないように */
const KEY_ORDER = ["id", "title", "aliases", "era", "unit", "release", "credits", "cover", "kind", "tieups", "videos", "note"];
const EDITED = ["credits", "release", "cover", "tieups", "aliases", "note"] as const;

/** undefined の項目を取り除く（JSON に書いたときと同じ形にする） */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => [k, x && typeof x === "object" && !Array.isArray(x) ? clean(x as object) : x]),
  ) as T;
}

/** 送られた内容でその曲の情報を置き換えた曲（ほかの項目はそのまま） */
export function applySongEdit(song: Song, p: Omit<SongEditPayload, "type" | "artist" | "id">): Song {
  const edited: Partial<Song> = clean({
    credits: p.credits && Object.values(clean(p.credits)).length ? clean(p.credits) : undefined,
    release: p.release,
    cover: p.cover,
    tieups: (p.tieups ?? []).map((t) => clean(t)),
    aliases: p.aliases ?? [],
    note: p.note,
  });
  const rest = Object.fromEntries(Object.entries(song).filter(([k]) => !(EDITED as readonly string[]).includes(k)));
  const merged = { ...rest, ...edited } as Record<string, unknown>;
  const keys = [...KEY_ORDER.filter((k) => k in merged), ...Object.keys(merged).filter((k) => !KEY_ORDER.includes(k))];
  return Object.fromEntries(keys.map((k) => [k, merged[k]])) as Song;
}
