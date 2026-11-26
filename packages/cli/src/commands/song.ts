import { findSong, normalizeTitle, parseCredits, Song, type ArtistConfig } from "@lovely-memory/core";
import { artistPath, loadArtist, loadSongs, writeJson } from "../repo.ts";
import { nextSongId, songIndex } from "../songs-merge.ts";

/**
 * 曲を登録する・登録済みの曲の情報を直す（作詞・作曲・編曲、発売日、カバーの原曲、タイアップなど）。
 *
 *   pnpm lm song <artistId> <曲名 または id> [options] [--dry-run]
 *   pnpm lm song <artistId> <曲名> --new [options]      新しく登録（カバー曲・未発売曲など）
 *
 * 曲が見つからなければ、曲名の打ち間違いで別の曲ができないように止める（新しい曲なら --new を付ける）。
 * --new で --cover を付けて --era を省くと、era は "cover"（artist.json に定義があれば）。
 *
 *   --credits "編曲：X"            書いた役割だけ上書き（ほかの役割は残す）
 *   --release-date <YYYY-MM-DD> --release-title <収録作品> --release-kind <single|digital|album|ep|other>
 *   --cover <原曲アーティスト> --cover-title <原曲名> --cover-release-date <YYYY-MM-DD> --cover-release-title <収録作品>
 *   --tieup "anime|作品名|オープニングテーマ"  （複数可。同じ種類・作品があれば役割を上書き、無ければ足す）
 *   --alias <別表記>（複数可、足す）  --note <メモ>  --era <eraId>  --unit <unitId>  --rename <新しい曲名>
 *   --unset <項目>（複数可）  credits / credits.lyrics / credits.music / credits.arrangement / release / cover /
 *                             cover.title / cover.release / tieups / aliases / note / unit
 *
 * 何が変わるかを表示する。--dry-run なら書き込まない。
 */
export async function song(artistId: string, opts: Record<string, unknown>) {
  const query = ((opts.args as string[] | undefined) ?? [])[0]?.trim();
  if (!query) throw new Error("曲名か id を指定してください（pnpm lm song <artistId> <曲名> [options]）");
  const artist = await loadArtist(artistId);
  const songs = await loadSongs(artistId);
  const found = songs.find((s) => s.id === query) ?? findSong(songs, { label: query, title: query });
  const changes = changesFromOptions(opts);

  if (opts.new) {
    const dup = found ?? songIndex(songs).get(normalizeTitle(query));
    if (dup) throw new Error(`既に登録されています: ${dup.id} ${dup.title}（直すなら --new を外す）`);
    const era = changes.era ?? (changes.cover?.artist && artist.eras.some((e) => e.id === "cover") ? "cover" : undefined);
    const added = applySongChanges(Song.parse({ id: nextSongId(songs), title: query }), { ...changes, era }, artist);
    console.log(`+ ${added.id} ${added.title}`);
    for (const line of songDiff(Song.parse({ id: added.id, title: added.title }), added)) console.log(`  ${line}`);
    if (opts["dry-run"]) {
      console.log("（--dry-run のため書き込んでいません）");
      return;
    }
    songs.push(added);
    await writeJson(artistPath(artistId, "songs.json"), songs);
    return;
  }

  if (!found) throw new Error(`曲が見つからない: ${query}（新しい曲なら --new を付ける）`);
  const song = found;
  const next = applySongChanges(song, changes, artist);
  const diff = songDiff(song, next);
  if (diff.length === 0) {
    console.log(`${song.id} ${song.title}: 変更なし`);
    return;
  }
  console.log(`${song.id} ${song.title}`);
  for (const line of diff) console.log(`  ${line}`);
  if (opts["dry-run"]) {
    console.log("（--dry-run のため書き込んでいません）");
    return;
  }
  songs[songs.indexOf(song)] = next;
  await writeJson(artistPath(artistId, "songs.json"), songs);
}

export type SongChanges = {
  credits?: string;
  release?: { date?: string; title?: string; kind?: string };
  cover?: { artist?: string; title?: string; releaseDate?: string; releaseTitle?: string };
  tieups?: string[];
  aliases?: string[];
  note?: string;
  era?: string;
  unit?: string;
  rename?: string;
  unset?: string[];
};

const UNSETTABLE = [
  "credits",
  "credits.lyrics",
  "credits.music",
  "credits.arrangement",
  "release",
  "cover",
  "cover.title",
  "cover.release",
  "tieups",
  "aliases",
  "note",
  "unit",
] as const;

function changesFromOptions(opts: Record<string, unknown>): SongChanges {
  const str = (k: string) => {
    const v = opts[k];
    return typeof v === "string" ? v : undefined;
  };
  const list = (k: string) => (Array.isArray(opts[k]) ? (opts[k] as string[]) : undefined);
  const release = { date: str("release-date"), title: str("release-title"), kind: str("release-kind") };
  const cover = {
    artist: str("cover"),
    title: str("cover-title"),
    releaseDate: str("cover-release-date"),
    releaseTitle: str("cover-release-title"),
  };
  const some = (o: object) => Object.values(o).some((v) => v !== undefined);
  return {
    credits: str("credits"),
    release: some(release) ? release : undefined,
    cover: some(cover) ? cover : undefined,
    tieups: list("tieup"),
    aliases: list("alias"),
    note: str("note"),
    era: str("era"),
    unit: str("unit"),
    rename: str("rename"),
    unset: list("unset"),
  };
}

/** 変更を当てた新しい曲（元の曲は変えない）。おかしな値は Song のスキーマで弾く */
export function applySongChanges(song: Song, c: SongChanges, artist: Pick<ArtistConfig, "eras" | "units">): Song {
  const s: Record<string, unknown> = structuredClone(song);
  for (const key of c.unset ?? []) {
    if (!(UNSETTABLE as readonly string[]).includes(key)) throw new Error(`--unset に使えない項目: ${key}（${UNSETTABLE.join(" / ")}）`);
    const [head, sub] = key.split(".") as [string, string | undefined];
    if (!sub) {
      if (head === "tieups" || head === "aliases") s[head] = [];
      else delete s[head];
    } else if (s[head]) {
      const obj = s[head] as Record<string, unknown>;
      delete obj[sub];
      if (Object.keys(obj).length === 0) delete s[head];
    }
  }
  if (c.rename) s.title = c.rename.trim();
  if (c.credits) {
    const parsed = parseCredits(c.credits);
    if (Object.keys(parsed).length === 0) throw new Error(`作詞・作曲・編曲が読み取れない: ${c.credits}（例: "作詞：A　作曲・編曲：B"）`);
    s.credits = { ...(s.credits as object | undefined), ...parsed };
  }
  if (c.release) s.release = { ...(s.release as object | undefined), ...defined(c.release) };
  if (c.cover) {
    const prev = (s.cover as Song["cover"]) ?? undefined;
    const release =
      c.cover.releaseDate || c.cover.releaseTitle
        ? { ...prev?.release, ...defined({ date: c.cover.releaseDate, title: c.cover.releaseTitle }) }
        : prev?.release;
    s.cover = { ...prev, ...defined({ artist: c.cover.artist, title: c.cover.title }), ...(release && { release }) };
  }
  for (const t of c.tieups ?? []) {
    const [type, work, role] = t.split("|").map((x) => x.trim());
    if (!type || !work) throw new Error(`--tieup は "種類|作品名|役割" の形で: ${t}`);
    const tieups = [...((s.tieups as Song["tieups"]) ?? [])];
    const i = tieups.findIndex((x) => x.type === type && x.work === work);
    const value = { type, work, ...(role && { role }) } as Song["tieups"][number];
    if (i >= 0) tieups[i] = { ...tieups[i], ...value };
    else tieups.push(value);
    s.tieups = tieups;
  }
  if (c.aliases?.length) s.aliases = [...new Set([...((s.aliases as string[]) ?? []), ...c.aliases.map((a) => a.trim())])];
  if (c.note !== undefined) s.note = c.note;
  if (c.era) {
    if (!artist.eras.some((e) => e.id === c.era)) throw new Error(`unknown era: ${c.era}`);
    s.era = c.era;
  }
  if (c.unit) {
    if (!artist.units.some((u) => u.id === c.unit)) throw new Error(`unknown unit: ${c.unit}`);
    s.unit = c.unit;
  }
  // 項目の順を songs.json のほかの曲とそろえる（スキーマの順）。値の確認もここで
  const r = Song.safeParse(s);
  if (!r.success) {
    throw new Error(`曲の情報が正しくない: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / ")}`);
  }
  return r.data;
}

const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** 変わった項目を「項目: 前 → 後」で */
export function songDiff(a: Song, b: Song): string[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])] as Array<keyof Song>;
  const show = (v: unknown) => (v === undefined ? "（なし）" : JSON.stringify(v));
  return keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k}: ${show(a[k])} → ${show(b[k])}`);
}
