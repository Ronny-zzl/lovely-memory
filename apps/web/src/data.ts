import {
  computeStats,
  resolveEvents,
  type ArtistConfig,
  type ResolvedEvent,
  type Setlist,
  type Song,
  type Stats,
} from "@lovely-memory/core/runtime";
import { artists as configs, loaders } from "virtual:lovely-memory/artists";

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
};

async function load(artist: ArtistConfig): Promise<ArtistData> {
  const loader = loaders[artist.id];
  if (!loader) throw new Error(`no data for ${artist.id}`);
  const { songs, events: rawEvents, overrides, setlists } = (await loader()).default;
  const events = resolveEvents(rawEvents, overrides, artist);
  return { artist, songs, events, setlists, allStats: computeStats({ songs, events, setlists }) };
}

const cache = new Map<string, Promise<ArtistData>>();

/** React の use() に渡すため、同じアーティストには同じ Promise を返す */
export function loadArtistData(artist: ArtistConfig): Promise<ArtistData> {
  let p = cache.get(artist.id);
  if (!p) {
    p = load(artist);
    cache.set(artist.id, p);
  }
  return p;
}
