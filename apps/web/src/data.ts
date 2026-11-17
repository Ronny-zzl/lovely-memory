import {
  ArtistConfig,
  EventList,
  Overrides,
  resolveEvents,
  Setlist,
  SongList,
  type ResolvedEvent,
  type Song,
} from "@lovely-memory/core";

/*
 * artists/<id>/ 以下のデータを読み込む。
 * - artist.json は一覧表示に使うので常に同梱（eager）
 * - それ以外はアーティストのページを開いたときに初めて読み込む（アーティストごとにチャンク分割される）
 */
const configModules = import.meta.glob<unknown>("../../../artists/*/artist.json", { eager: true, import: "default" });
const songModules = import.meta.glob<unknown>("../../../artists/*/songs.json", { import: "default" });
const eventModules = import.meta.glob<unknown>("../../../artists/*/events.json", { import: "default" });
const overrideModules = import.meta.glob<unknown>("../../../artists/*/overrides.json", { import: "default" });
const setlistModules = import.meta.glob<unknown>("../../../artists/*/setlists/*.yaml", { import: "default" });

/** "../../../artists/<id>/..." から <id> を取り出す */
const artistIdOf = (path: string) => path.split("/artists/")[1]!.split("/")[0]!;

export const artists: ArtistConfig[] = Object.values(configModules)
  .map((raw) => ArtistConfig.parse(raw))
  .sort((a, b) => a.id.localeCompare(b.id));

export function findArtist(id: string | undefined): ArtistConfig | undefined {
  return artists.find((a) => a.id === id);
}

export type ArtistData = {
  artist: ArtistConfig;
  songs: Song[];
  /** overrides・種別判定適用済み、日付昇順 */
  events: ResolvedEvent[];
  setlists: Setlist[];
};

async function loadOne(
  modules: Record<string, () => Promise<unknown>>,
  artistId: string,
  file: string,
): Promise<unknown | undefined> {
  const entry = Object.entries(modules).find(([p]) => artistIdOf(p) === artistId && p.endsWith(`/${file}`));
  return entry ? entry[1]() : undefined;
}

async function load(artist: ArtistConfig): Promise<ArtistData> {
  const [songsRaw, eventsRaw, overridesRaw, setlistsRaw] = await Promise.all([
    loadOne(songModules, artist.id, "songs.json"),
    loadOne(eventModules, artist.id, "events.json"),
    loadOne(overrideModules, artist.id, "overrides.json"),
    Promise.all(
      Object.entries(setlistModules)
        .filter(([p]) => artistIdOf(p) === artist.id)
        .map(([, imp]) => imp()),
    ),
  ]);
  const songs = SongList.parse(songsRaw ?? []);
  const events = resolveEvents(EventList.parse(eventsRaw ?? []), Overrides.parse(overridesRaw ?? {}), artist);
  const setlists = setlistsRaw.map((s) => Setlist.parse(s));
  return { artist, songs, events, setlists };
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
