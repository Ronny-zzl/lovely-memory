import { artistPath, loadArtist, loadSongs, sleep, USER_AGENT, writeJson } from "../repo";
import { adapters } from "../sources/official";
import { mergeTracks, type ImportedTrack } from "../songs-merge";
import { reportSongs } from "./report";

const INTERVAL_MS = 2000;

/**
 * 公式サイトのディスコグラフィから songs.json を更新する。
 * 公式を一次情報とみなし、クレジット・ユニットは公式の値で上書きする（差分はログに出る）。
 *
 *   pnpm lm import-official <artistId> [--dry-run]
 */
export async function importOfficial(artistId: string, opts: Record<string, string | boolean>) {
  const artist = await loadArtist(artistId);
  const src = artist.sources.official;
  if (!src) throw new Error("artist.json に sources.official がありません");
  const adapter = adapters[src.adapter];
  if (!adapter) throw new Error(`unknown adapter: ${src.adapter} (available: ${Object.keys(adapters).join(", ")})`);

  let first = true;
  const fetchHtml = async (url: string) => {
    if (!first) await sleep(INTERVAL_MS);
    first = false;
    process.stderr.write(`GET ${decodeURI(url)}\n`);
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`${res.status}: ${url}`);
    return res.text();
  };

  const unitByLabel = new Map(artist.units.map((u) => [u.label, u.id]));
  const official = await adapter(src.url, fetchHtml);
  const unknownUnits = new Set(official.map((t) => t.unitLabel).filter((l) => l && !unitByLabel.has(l)));
  if (unknownUnits.size) console.warn(`units not in artist.json: ${[...unknownUnits].join(", ")}`);

  const tracks: ImportedTrack[] = official.map((t) => ({
    title: t.title,
    credits: t.credits,
    unit: t.unitLabel ? unitByLabel.get(t.unitLabel) : undefined,
    release: t.release,
  }));

  const songs = await loadSongs(artistId);
  const result = mergeTracks(songs, tracks, { artist, mode: "authoritative" });
  reportSongs(tracks.length, result, songs);
  if (!opts["dry-run"]) await writeJson(artistPath(artistId, "songs.json"), songs);
}
