import { normalizeTitle, type ArtistConfig, type CreditRoles, type Song } from "@lovely-memory/core";

export type ImportedTrack = {
  title: string;
  credits: CreditRoles;
  unit?: string;
  release: NonNullable<Song["release"]>;
};

/** since を持つ era のうち、date 以前で最も新しいものを返す */
export function eraForDate(artist: ArtistConfig, date: string): string | undefined {
  return artist.eras.filter((e) => e.since && e.since <= date).sort((a, b) => b.since!.localeCompare(a.since!))[0]?.id;
}

export function songIndex(songs: Song[]): Map<string, Song> {
  const map = new Map<string, Song>();
  for (const s of songs) {
    map.set(normalizeTitle(s.title), s);
    for (const a of s.aliases) map.set(normalizeTitle(a), s);
  }
  return map;
}

export function nextSongId(songs: Song[]): string {
  const n = Math.max(0, ...songs.map((s) => Number(s.id.match(/^s(\d+)$/)?.[1] ?? 0)));
  return `s${String(n + 1).padStart(3, "0")}`;
}

export type MergeOptions = {
  artist: ArtistConfig;
  /**
   * fill: 空いている項目だけ埋める（Wikipedia など二次情報）
   * authoritative: クレジット・ユニットは取り込み元の値で上書き（公式サイト）
   */
  mode: "fill" | "authoritative";
  /** 新規曲の era を固定したい場合。未指定なら発売日から eraForDate で判定 */
  era?: string;
};

/** songs を破壊的に更新し、変更内容のログを返す */
export function mergeTracks(songs: Song[], tracks: ImportedTrack[], opts: MergeOptions) {
  const sorted = [...tracks].sort((a, b) => a.release.date.localeCompare(b.release.date));
  const index = songIndex(songs);
  const log: string[] = [];
  let added = 0;
  const updatedIds = new Set<string>();

  for (const t of sorted) {
    const existing = index.get(normalizeTitle(t.title));
    if (!existing) {
      const song: Song = {
        id: nextSongId(songs),
        title: t.title,
        aliases: [],
        tieups: [],
        videos: [],
        era: opts.era ?? eraForDate(opts.artist, t.release.date),
        unit: t.unit,
        release: t.release,
        credits: Object.keys(t.credits).length ? { ...t.credits } : undefined,
      };
      songs.push(song);
      index.set(normalizeTitle(t.title), song);
      added++;
      log.push(`+ ${song.id} ${song.title} (${t.release.date} ${t.release.title})`);
      continue;
    }

    const change = (field: string, from: unknown, to: unknown) => {
      updatedIds.add(existing.id);
      log.push(`~ ${existing.id} ${existing.title}: ${field} ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
    };

    // 収録作品は最も早い発売のものを採用。同じ作品なら欠けている項目（url など）だけ補う
    const r = existing.release;
    if (!r || t.release.date < r.date) {
      change("release", r?.title, t.release.title);
      existing.release = t.release;
    } else if (r.date === t.release.date && normalizeTitle(r.title) === normalizeTitle(t.release.title)) {
      if (!r.url && t.release.url) {
        r.url = t.release.url;
        updatedIds.add(existing.id);
      }
    }

    if (t.unit && t.unit !== existing.unit && (opts.mode === "authoritative" || !existing.unit)) {
      change("unit", existing.unit, t.unit);
      existing.unit = t.unit;
    }
    if (!existing.era) {
      const era = opts.era ?? eraForDate(opts.artist, t.release.date);
      if (era) {
        existing.era = era;
        change("era", undefined, era);
      }
    }
    for (const [k, v] of Object.entries(t.credits) as [keyof CreditRoles, string][]) {
      const cur = existing.credits?.[k];
      if (cur === v) continue;
      if (cur && opts.mode === "fill") continue;
      change(`credits.${k}`, cur, v);
      existing.credits = { ...existing.credits, [k]: v };
    }
  }
  return { added, updated: updatedIds.size, log };
}
