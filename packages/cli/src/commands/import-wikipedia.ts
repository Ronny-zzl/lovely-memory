import { readFile } from "node:fs/promises";
import { normalizeTitle, type Song } from "@lovely-memory/core";
import { artistPath, loadArtist, loadSongs, USER_AGENT, writeJson } from "../repo";
import { parseDiscography, type ParsedTrack } from "../wikipedia";

async function fetchWikitext(lang: string, title: string): Promise<string> {
  const url = `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}: ${url}`);
  return res.text();
}

function nextIdFactory(songs: Song[]) {
  let n = Math.max(0, ...songs.map((s) => Number(s.id.match(/^s(\d+)$/)?.[1] ?? 0)));
  return () => `s${String(++n).padStart(3, "0")}`;
}

/**
 * Wikipedia のディスコグラフィから songs.json を作成・補完する。
 * 既存の曲（正規化した曲名で照合）は、空いている項目だけを埋める。手で直した値は上書きしない。
 *
 *   pnpm lm import-wikipedia <artistId> [--era <eraId>] [--file <wikitext>] [--dry-run]
 */
export async function importWikipedia(artistId: string, opts: Record<string, string | boolean>) {
  const artist = await loadArtist(artistId);
  const wiki = artist.sources.wikipedia;
  const era = typeof opts.era === "string" ? opts.era : undefined;
  if (era && !artist.eras.some((e) => e.id === era)) throw new Error(`unknown era: ${era}`);

  const wikitext =
    typeof opts.file === "string"
      ? await readFile(opts.file, "utf8")
      : wiki
        ? await fetchWikitext(wiki.lang, wiki.title)
        : (() => {
            throw new Error("artist.json に sources.wikipedia がありません（--file で指定も可）");
          })();

  const unitByLabel = new Map(artist.units.map((u) => [u.label, u.id]));
  const parsed = parseDiscography(wikitext, [...unitByLabel.keys()]);
  // 発売日順に採番したいので安定ソート
  parsed.sort((a, b) => a.release.date.localeCompare(b.release.date));

  const songs = await loadSongs(artistId);
  const byKey = new Map(songs.map((s) => [normalizeTitle(s.title), s]));
  for (const s of songs) for (const a of s.aliases) byKey.set(normalizeTitle(a), s);
  const nextId = nextIdFactory(songs);

  let added = 0;
  let updated = 0;
  const apply = (t: ParsedTrack) => {
    const key = normalizeTitle(t.title);
    const unit = t.unitLabel ? unitByLabel.get(t.unitLabel) : undefined;
    const existing = byKey.get(key);
    if (!existing) {
      const song: Song = {
        id: nextId(),
        title: t.title,
        aliases: [],
        era,
        unit,
        release: t.release,
        credits: Object.keys(t.credits).length ? t.credits : undefined,
      };
      songs.push(song);
      byKey.set(key, song);
      added++;
      return;
    }
    let changed = false;
    if (!existing.era && era) (existing.era = era), (changed = true);
    if (!existing.unit && unit) (existing.unit = unit), (changed = true);
    if (!existing.release) (existing.release = t.release), (changed = true);
    for (const [k, v] of Object.entries(t.credits) as [keyof typeof t.credits, string][]) {
      existing.credits ??= {};
      if (!existing.credits[k]) (existing.credits[k] = v), (changed = true);
    }
    if (changed) updated++;
  };
  parsed.forEach(apply);

  console.log(`parsed ${parsed.length} tracks → added ${added}, updated ${updated}, total ${songs.length}`);
  const noCredits = songs.filter((s) => !s.credits?.lyrics || !s.credits?.music || !s.credits?.arrangement);
  if (noCredits.length) console.log(`credits incomplete (${noCredits.length}): ${noCredits.map((s) => s.title).join(" / ")}`);

  if (opts["dry-run"]) {
    console.log(JSON.stringify(songs, null, 2));
    return;
  }
  await writeJson(artistPath(artistId, "songs.json"), songs);
}
