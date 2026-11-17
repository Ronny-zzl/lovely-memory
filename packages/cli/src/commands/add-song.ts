import { normalizeTitle, parseCredits, Song } from "@lovely-memory/core";
import { artistPath, loadArtist, loadSongs, writeJson } from "../repo";
import { nextSongId, songIndex } from "../songs-merge";

/**
 * カバー曲・未発売曲などを 1 曲追加する。
 *
 *   pnpm lm add-song <artistId> --title "曲名" [--cover "原曲アーティスト"] [--unit all]
 *                    [--era 2nd] [--credits "作詞：A　作曲・編曲：B"] [--alias 別表記 ...] [--note メモ]
 *
 * --cover を付けて --era を省略すると era は "cover"（artist.json に定義があれば）になる。
 */
export async function addSong(artistId: string, opts: Record<string, unknown>) {
  const artist = await loadArtist(artistId);
  const title = typeof opts.title === "string" ? opts.title.trim() : "";
  if (!title) throw new Error("--title は必須です");

  const songs = await loadSongs(artistId);
  const dup = songIndex(songs).get(normalizeTitle(title));
  if (dup) throw new Error(`既に登録されています: ${dup.id} ${dup.title}`);

  const str = (k: string) => (typeof opts[k] === "string" ? (opts[k] as string) : undefined);
  const cover = str("cover");
  const era = str("era") ?? (cover && artist.eras.some((e) => e.id === "cover") ? "cover" : undefined);
  const unit = str("unit");
  if (era && !artist.eras.some((e) => e.id === era)) throw new Error(`unknown era: ${era}`);
  if (unit && !artist.units.some((u) => u.id === unit)) throw new Error(`unknown unit: ${unit}`);
  const credits = str("credits") ? parseCredits(str("credits")!) : undefined;

  const song = Song.parse({
    id: nextSongId(songs),
    title,
    aliases: (opts.alias as string[] | undefined) ?? [],
    era,
    unit,
    credits: credits && Object.keys(credits).length ? credits : undefined,
    cover: cover ? { artist: cover } : undefined,
    note: str("note"),
  });
  songs.push(song);
  await writeJson(artistPath(artistId, "songs.json"), songs);
  console.log(`+ ${song.id} ${song.title}${cover ? ` (cover: ${cover})` : ""}`);
}
