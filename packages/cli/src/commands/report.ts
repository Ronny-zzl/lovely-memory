import type { Song } from "@lovely-memory/core";

export function reportSongs(parsed: number, result: { added: number; updated: number; log: string[] }, songs: Song[]) {
  for (const l of result.log) console.log(l);
  console.log(`parsed ${parsed} tracks → added ${result.added}, updated ${result.updated}, total ${songs.length}`);
  const incomplete = songs.filter((s) => !s.cover && (!s.credits?.lyrics || !s.credits?.music || !s.credits?.arrangement));
  if (incomplete.length) {
    console.log(`credits incomplete (${incomplete.length}): ${incomplete.map((s) => s.title).join(" / ")}`);
  }
}
