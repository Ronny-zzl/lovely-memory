import { appendFile, readFile, writeFile } from "node:fs/promises";
import { EditPayload, findSong, normalizeTitle, resolveEvents, Setlist, Song, UNKNOWN_SONG, type SetlistItem } from "@lovely-memory/core";
import { artistPath, loadArtist, loadEvents, loadOverrides, loadSongs, writeJson } from "../repo.ts";
import { countSongs, writeSetlist } from "../setlist-build.ts";
import { nextSongId, songIndex } from "../songs-merge.ts";

/**
 * 入力画面から送られたセトリ（EditPayload の JSON）を確かめて書き込む（GitHub Actions の apply-edit.yml から使う）。
 *
 *   pnpm lm apply-edit --file <payload.json> [--commit-msg <path>]
 *
 * - newSongs の曲を songs.json に足す（既にある曲名なら足さない）
 * - 曲名は songs.json の正式な表記にそろえる。見つからない曲があれば何も書かずに失敗する
 * - 既存のセトリは置き換える（入力画面で直したものを保存し直すため）
 */
export async function applyEdit(_target: string | undefined, opts: Record<string, unknown>) {
  if (typeof opts.file !== "string") throw new Error("--file が必要です");
  const payload = EditPayload.parse(JSON.parse(await readFile(opts.file, "utf8")));

  const artist = await loadArtist(payload.artist);
  const songs = await loadSongs(payload.artist);
  const events = resolveEvents(await loadEvents(payload.artist), await loadOverrides(payload.artist), artist);
  const event = events.find((e) => e.id === payload.event);
  if (!event) throw new Error(`イベント ${payload.event} が見つからない（${payload.artist}）`);
  const memberIds = new Set(artist.members.map((m) => m.id));

  // 新しい曲
  const added: Song[] = [];
  for (const n of payload.newSongs) {
    if (songIndex(songs).get(normalizeTitle(n.title))) continue;
    const cover = n.cover?.trim();
    const song = Song.parse({
      id: nextSongId(songs),
      title: n.title.trim(),
      era: cover && artist.eras.some((e) => e.id === "cover") ? "cover" : undefined,
      cover: cover ? { artist: cover } : undefined,
    });
    songs.push(song);
    added.push(song);
  }

  // 曲名をそろえる
  const unknown: string[] = [];
  const stages = payload.stages.map((st) => ({
    ...(st.name?.trim() && { name: st.name.trim() }),
    ...(st.collab && { collab: true }),
    items: st.items.map((it): SetlistItem => {
      let title = it.song.trim();
      if (title !== UNKNOWN_SONG) {
        const song = findSong(songs, { label: title, title });
        if (!song) unknown.push(title);
        else title = song.title;
      }
      for (const m of it.members ?? []) if (!memberIds.has(m)) throw new Error(`メンバー "${m}" が ${artist.id} にいない`);
      const extra = {
        ...(it.encore && { encore: true }),
        ...(it.note?.trim() && { note: it.note.trim() }),
        ...(it.members?.length && { members: it.members }),
        ...(it.with?.length && { with: it.with.map((w) => w.trim()).filter(Boolean) }),
      };
      return Object.keys(extra).length ? { song: title, ...extra } : title;
    }),
  }));
  if (unknown.length) throw new Error(`songs.json に無い曲: ${unknown.join(" / ")}（新しい曲なら newSongs に入れる）`);
  if (stages.every((st) => st.items.length === 0)) throw new Error("曲が 1 曲も無い");

  const setlist = Setlist.parse({
    event: event.id,
    ...(payload.source && { source: payload.source }),
    ...(payload.note?.trim() && { note: payload.note.trim() }),
    ...(payload.completeness && { completeness: payload.completeness }),
    // ステージが 1 つで名前も無ければ items に直接書く
    ...(stages.length === 1 && !stages[0]!.name ? { items: stages[0]!.items } : { stages }),
  });

  if (added.length) await writeJson(artistPath(payload.artist, "songs.json"), songs);
  await writeSetlist(payload.artist, setlist, event);

  const summary = `${event.date} ${event.title}（${countSongs(setlist)} 曲${added.length ? `、新しい曲 ${added.map((s) => s.title).join("・")}` : ""}）`;
  console.log(`セトリを保存: ${artist.id} ${summary}`);
  if (typeof opts["commit-msg"] === "string") {
    await writeFile(opts["commit-msg"], `Setlist from the entry form: ${artist.name} ${summary}\n`, "utf8");
  }
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `セトリを保存: ${artist.name} ${summary}\n`);
}
