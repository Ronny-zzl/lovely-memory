import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  applySongEdit,
  draftToPayload,
  EditPayload,
  findSong,
  payloadToSetlist,
  Setlist,
  setlistToDraft,
  Song,
  songDraftProblems,
  songDraftToPayload,
  SongEditPayload,
  songToDraft,
} from "@lovely-memory/core";
import { ARTISTS_DIR, loadSetlistFiles, loadSongs } from "../repo.ts";

/** セトリ → 入力画面の下書き → 送る内容（Worker・apply-edit と同じく EditPayload で確かめる）→ セトリ */
function roundTrip(setlist: Setlist, artist: string, songs: Song[]) {
  const payload = EditPayload.parse(draftToPayload(setlistToDraft(setlist), artist, setlist.event, []));
  return payloadToSetlist(payload, (title) => findSong(songs, { label: title, title })?.title);
}

describe("入力画面で開いて、そのまま保存し直しても変わらない", () => {
  it("リポジトリの全部のセトリ", async () => {
    const artists = (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    let checked = 0;
    for (const artist of artists) {
      const songs = await loadSongs(artist);
      for (const f of await loadSetlistFiles(artist)) {
        const original = Setlist.parse(f.raw);
        const { setlist, unknown } = roundTrip(original, artist, songs);
        expect(unknown, f.path).toEqual([]);
        expect(setlist, f.path).toEqual(original);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("入力画面で直せない項目（ステージの出演メンバー・メモ）も残る", () => {
    const original = Setlist.parse({
      event: 1,
      note: "メモ",
      stages: [
        { name: "第 1 部", members: ["a", "b"], note: "昼", items: ["曲A", { song: "曲B", encore: true, note: "short ver." }] },
        { name: "コラボステージ", collab: true, items: [{ song: "曲C", members: ["a"], with: ["サーガ・イースト", "他の人"] }] },
      ],
    });
    const { setlist } = roundTrip(original, "x", []);
    expect(setlist).toEqual(original);
  });

  it("セトリの途中のコラボの曲（一緒に歌った人つき）も残る", () => {
    const original = Setlist.parse({
      event: 1,
      items: ["曲A", { song: "曲B", collab: true, with: ["他のグループ"], members: ["a"] }, "曲C"],
    });
    expect(roundTrip(original, "x", []).setlist).toEqual(original);
  });

  it("名前の無いステージ 1 つでも、コラボの印などがあれば stages のまま", () => {
    const original = Setlist.parse({ event: 1, stages: [{ collab: true, items: ["曲A"] }] });
    expect(roundTrip(original, "x", []).setlist).toEqual(original);
    const plain = Setlist.parse({ event: 1, completeness: "partial", items: ["曲A", "?"] });
    expect(roundTrip(plain, "x", []).setlist).toEqual(plain);
  });
});

describe("payloadToSetlist", () => {
  it("曲名を songs.json の表記にそろえ、無い曲を返す。空の項目・前後の空白は除く", () => {
    const payload = EditPayload.parse({
      artist: "x",
      event: 1,
      note: "  ",
      stages: [{ name: " ", items: [{ song: " はつこい ", note: " ", with: [] }, { song: "知らない曲" }] }],
    });
    const songs = [{ id: "s001", title: "初恋", aliases: ["はつこい"] }] as unknown as Song[];
    const { setlist, unknown } = payloadToSetlist(payload, (t) => findSong(songs, { label: t, title: t })?.title);
    expect(setlist).toEqual({ event: 1, items: ["初恋", "知らない曲"] });
    expect(unknown).toEqual(["知らない曲"]);
  });
});

describe("曲の情報：入力画面で開いて、そのまま保存し直しても変わらない", () => {
  it("リポジトリの全部の曲", async () => {
    const artists = (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    let checked = 0;
    for (const artist of artists) {
      for (const song of await loadSongs(artist)) {
        const payload = SongEditPayload.parse(songDraftToPayload(songToDraft(song), artist, song.id));
        const after = Song.parse(applySongEdit(song, payload));
        expect(after, `${artist} ${song.id}`).toEqual(song);
        // 項目の順も変わらない（songs.json の差分が出ない）
        expect(Object.keys(applySongEdit(song, payload)), `${artist} ${song.id}`).toEqual(Object.keys(song));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("直した項目だけが変わり、空にした項目は消える。曲名・動画などはそのまま", () => {
    const song = Song.parse({
      id: "s001",
      title: "曲A",
      aliases: ["きょくA"],
      release: { date: "2026-01-01", title: "A", kind: "single" },
      credits: { lyrics: "X", music: "Y" },
      tieups: [{ type: "anime", work: "作品", role: "OP" }],
      videos: [{ id: "abcdefghijk", kind: "mv", date: "2026-01-01" }],
      note: "メモ",
    });
    const draft = songToDraft(song);
    const edited = {
      ...draft,
      lyrics: "",
      music: "",
      arrangement: " Z ",
      releaseDate: "",
      releaseTitle: "",
      tieups: [
        ...draft.tieups,
        { type: "cm" as const, work: "CM", role: "", url: "" },
        { type: "anime" as const, work: " ", role: "", url: "" },
      ],
      aliases: "きょくA\nきょくA\n\nキョクA",
      note: "",
    };
    expect(songDraftProblems(edited)).toEqual([]);
    const after = Song.parse(applySongEdit(song, SongEditPayload.parse(songDraftToPayload(edited, "x", "s001"))));
    expect(after).toEqual({
      id: "s001",
      title: "曲A",
      aliases: ["きょくA", "キョクA"],
      credits: { arrangement: "Z" },
      tieups: [
        { type: "anime", work: "作品", role: "OP" },
        { type: "cm", work: "CM" },
      ],
      videos: song.videos,
    });
  });

  it("足りない入力を知らせる", () => {
    const d = { ...songToDraft(Song.parse({ id: "s1", title: "A" })), releaseDate: "2026/1/1", coverTitle: "原曲" };
    expect(songDraftProblems(d)).toEqual([
      "発売日を YYYY-MM-DD で入れてください",
      "収録作品を入れてください",
      "原曲のアーティストを入れてください",
    ]);
  });
});
