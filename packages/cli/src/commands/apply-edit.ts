import { appendFile, readFile, writeFile } from "node:fs/promises";
import {
  applySongEdit,
  EditPayload,
  findSong,
  normalizeTitle,
  payloadToSetlist,
  resolveEvents,
  Setlist,
  setlistStages,
  Song,
  SongEditPayload,
} from "@lovely-memory/core";
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
 * - type: "song" のときは曲の情報の入力画面から（SongEditPayload）。songs.json のその曲を書き換える
 */
export async function applyEdit(_target: string | undefined, opts: Record<string, unknown>) {
  if (typeof opts.file !== "string") throw new Error("--file が必要です");
  const raw = JSON.parse(await readFile(opts.file, "utf8")) as { type?: unknown };
  const commitMsg = typeof opts["commit-msg"] === "string" ? opts["commit-msg"] : undefined;
  if (raw.type === "song") return applySongInfo(SongEditPayload.parse(raw), commitMsg);
  const payload = EditPayload.parse(raw);

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

  // 曲名を songs.json の表記にそろえ、セトリの形にする（入力画面で直せない項目もそのまま残る）
  const { setlist: built, unknown } = payloadToSetlist(payload, (title) => findSong(songs, { label: title, title })?.title);
  if (unknown.length) throw new Error(`songs.json に無い曲: ${unknown.join(" / ")}（新しい曲なら newSongs に入れる）`);
  const setlist = Setlist.parse(built);
  // ステージ・曲のメンバーが、このグループのメンバーか
  const used = setlistStages(setlist).flatMap((st) => [
    ...(st.members ?? []),
    ...st.items.flatMap((it) => (typeof it === "string" ? [] : (it.members ?? []))),
  ]);
  const strangers = [...new Set(used.filter((m) => !memberIds.has(m)))];
  if (strangers.length) throw new Error(`メンバー ${strangers.map((m) => `"${m}"`).join("・")} が ${artist.id} にいない`);
  if (setlistStages(setlist).every((st) => st.items.length === 0)) throw new Error("曲が 1 曲も無い");

  if (added.length) await writeJson(artistPath(payload.artist, "songs.json"), songs);
  await writeSetlist(payload.artist, setlist, event);

  const summary = `${event.date} ${event.title}（${countSongs(setlist)} 曲${added.length ? `、新しい曲 ${added.map((s) => s.title).join("・")}` : ""}）`;
  console.log(`セトリを保存: ${artist.id} ${summary}`);
  if (typeof opts["commit-msg"] === "string") {
    await writeFile(opts["commit-msg"], `Setlist from the entry form: ${artist.name} ${summary}\n`, "utf8");
  }
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `セトリを保存: ${artist.name} ${summary}\n`);
}

/** 曲の情報の入力画面から送られた内容で、songs.json のその曲を書き換える */
async function applySongInfo(payload: ReturnType<typeof SongEditPayload.parse>, commitMsg: string | undefined) {
  const artist = await loadArtist(payload.artist);
  const songs = await loadSongs(payload.artist);
  const index = songs.findIndex((s) => s.id === payload.id);
  if (index < 0) throw new Error(`曲 ${payload.id} が見つからない（${payload.artist}）`);
  const before = songs[index]!;
  const after = Song.parse(applySongEdit(before, payload));
  // 別表記が、ほかの曲の曲名・別表記と同じになっていないか（セトリの照合が曖昧になる）
  const others = songIndex(songs.filter((s) => s.id !== payload.id));
  const clash = after.aliases.filter((a) => others.get(normalizeTitle(a)));
  if (clash.length) throw new Error(`別表記 ${clash.join(" / ")} はほかの曲の曲名・別表記と同じ`);
  songs[index] = after;
  await writeJson(artistPath(payload.artist, "songs.json"), songs);

  const changed = (Object.keys({ ...before, ...after }) as (keyof Song)[]).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
  const summary = `${after.title}（${changed.length ? changed.join("・") : "変更なし"}）`;
  console.log(`曲の情報を保存: ${artist.id} ${summary}`);
  if (commitMsg) await writeFile(commitMsg, `Song info from the entry form: ${artist.name} ${summary}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `曲の情報を保存: ${artist.name} ${summary}\n`);
}
