import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { draftToPayload, EditPayload, findSong, payloadToSetlist, Setlist, setlistToDraft, type Song } from "@lovely-memory/core";
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
