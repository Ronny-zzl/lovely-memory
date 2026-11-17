import { readFile } from "node:fs/promises";
import { artistPath, loadArtist, loadSongs, USER_AGENT, writeJson } from "../repo.ts";
import { mergeTracks, type ImportedTrack } from "../songs-merge.ts";
import { parseDiscography } from "../wikipedia.ts";
import { reportSongs } from "./report.ts";

async function fetchWikitext(lang: string, title: string): Promise<string> {
  const url = `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}: ${url}`);
  return res.text();
}

/**
 * Wikipedia のディスコグラフィから songs.json を補完する（空き項目のみ。既存値は上書きしない）。
 *
 *   pnpm lm import-wikipedia <artistId> [--era <eraId>] [--file <wikitext>] [--dry-run]
 */
export async function importWikipedia(artistId: string, opts: Record<string, string | boolean>) {
  const artist = await loadArtist(artistId);
  const wiki = artist.sources.wikipedia;
  const era = typeof opts.era === "string" ? opts.era : undefined;
  if (era && !artist.eras.some((e) => e.id === era)) throw new Error(`unknown era: ${era}`);

  let wikitext: string;
  if (typeof opts.file === "string") wikitext = await readFile(opts.file, "utf8");
  else if (wiki) wikitext = await fetchWikitext(wiki.lang, wiki.title);
  else throw new Error("artist.json に sources.wikipedia がありません（--file で指定も可）");

  const unitByLabel = new Map(artist.units.map((u) => [u.label, u.id]));
  const tracks: ImportedTrack[] = parseDiscography(wikitext, [...unitByLabel.keys()]).map((t) => ({
    title: t.title,
    credits: t.credits,
    unit: t.unitLabel ? unitByLabel.get(t.unitLabel) : undefined,
    release: t.release,
  }));

  const songs = await loadSongs(artistId);
  const result = mergeTracks(songs, tracks, { artist, mode: "fill", era });
  reportSongs(tracks.length, result, songs);
  if (!opts["dry-run"]) await writeJson(artistPath(artistId, "songs.json"), songs);
}
