import {
  computeMilestones,
  computePatterns,
  isLiveEvent,
  computeStats,
  resolveEvents,
  type ArtistConfig,
  type ResolvedEvent,
  type Setlist,
  type Milestones,
  type Patterns,
  type Song,
  type Stats,
} from "@lovely-memory/core/runtime";
import { artists as configs, loaders } from "virtual:lovely-memory/artists";
import { todayJst } from "./format.ts";

/*
 * artists/<id>/ 以下のデータ。検証・既定値の補完はビルド時（plugins/artists-data.ts）に済んでいる。
 * - artist.json は一覧表示に使うので常に同梱
 * - それ以外はアーティストのページを開いたときに初めて読み込む（アーティストごとに 1 チャンク）
 */
export const artists: ArtistConfig[] = configs;

export function findArtist(id: string | undefined): ArtistConfig | undefined {
  return artists.find((a) => a.id === id);
}

export type ArtistData = {
  artist: ArtistConfig;
  songs: Song[];
  /** overrides・種別判定適用済み、日付昇順 */
  events: ResolvedEvent[];
  setlists: Setlist[];
  /**
   * 全イベントを対象にした集計。初披露の判定はこれを基準にする
   * （絞り込み後の集計で判定すると、フィルタによって初披露が変わってしまうため）
   */
  allStats: Stats;
  /** 全イベントの曲順の傾向（1 曲目・ラスト・つながり） */
  patterns: Patterns;
  /** 記録の節目（読み込んだ日の時点） */
  milestones: Milestones;
};

async function load(artist: ArtistConfig): Promise<ArtistData> {
  const loader = loaders[artist.id];
  if (!loader) throw new Error(`no data for ${artist.id}`);
  const { songs, events: rawEvents, overrides, setlists } = (await loader()).default;
  const events = resolveEvents(rawEvents, overrides, artist);
  const allStats = computeStats({ songs, events, setlists });
  const milestones = computeMilestones({ stats: allStats, liveEvents: events.filter(isLiveEvent), since: artist.since, today: todayJst() });
  return { artist, songs, events, setlists, allStats, patterns: computePatterns(allStats.events), milestones };
}

const cache = new Map<string, Promise<ArtistData>>();

/** React の use() に渡すため、同じアーティストには同じ Promise を返す */
export function loadArtistData(artist: ArtistConfig): Promise<ArtistData> {
  let p = cache.get(artist.id);
  if (!p) {
    const promise = load(artist);
    // 読み込み済みの印を付けておくと、React の use() が待たずに値を返す
    // （付けないと、解決済みでも一度「読み込み中」を出し、React の仕様で最低 300ms 表示し続ける）
    promise.then(
      (value) => Object.assign(promise, { status: "fulfilled", value }),
      (reason) => Object.assign(promise, { status: "rejected", reason }),
    );
    p = promise;
    cache.set(artist.id, p);
  }
  return p;
}
