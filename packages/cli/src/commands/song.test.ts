import { describe, expect, it } from "vitest";
import { Song } from "@lovely-memory/core";
import { applySongChanges, songDiff } from "./song.ts";

const artist = {
  eras: [
    { id: "original", label: "オリジナル" },
    { id: "cover", label: "カバー" },
  ],
  units: [],
} as never;
const base = Song.parse({
  id: "s002",
  title: "初恋の合図",
  release: { date: "2026-11-11", title: "Love & Hearts", kind: "album" },
  credits: { lyrics: "A", music: "B" },
  tieups: [{ type: "anime", work: "作品", role: "OP" }],
});

describe("applySongChanges", () => {
  it("作詞・作曲・編曲は書いた役割だけ上書きする", () => {
    expect(applySongChanges(base, { credits: "編曲：C" }, artist).credits).toEqual({ lyrics: "A", music: "B", arrangement: "C" });
    expect(applySongChanges(base, { credits: "作詞：B　作曲：A" }, artist).credits).toEqual({ lyrics: "B", music: "A" });
  });

  it("発売の一部だけ直せる。新しく足すときは 3 つ揃っていないと弾く", () => {
    expect(applySongChanges(base, { release: { date: "2026-07-11", title: "初恋の合図", kind: "digital" } }, artist).release).toEqual({
      date: "2026-07-11",
      title: "初恋の合図",
      kind: "digital",
    });
    expect(applySongChanges(base, { release: { date: "2026-07-12" } }, artist).release?.title).toBe("Love & Hearts");
    const noRelease = Song.parse({ id: "s9", title: "x" });
    expect(() => applySongChanges(noRelease, { release: { date: "2026-07-12" } }, artist)).toThrow(/release\.title/);
  });

  it("タイアップは同じ種類・作品なら役割を上書き、無ければ足す", () => {
    const s = applySongChanges(base, { tieups: ["anime|作品|オープニングテーマ", "game|ゲーム"] }, artist);
    expect(s.tieups).toEqual([
      { type: "anime", work: "作品", role: "オープニングテーマ" },
      { type: "game", work: "ゲーム" },
    ]);
    expect(() => applySongChanges(base, { tieups: ["anime"] }, artist)).toThrow(/種類\|作品名/);
    expect(() => applySongChanges(base, { tieups: ["film|作品"] }, artist)).toThrow(/tieups\.1\.type/);
  });

  it("カバーの原曲と発売を足せる", () => {
    const s = applySongChanges(
      Song.parse({ id: "s9", title: "x", cover: { artist: "原曲の人" } }),
      { cover: { releaseDate: "1999-03-05" } },
      artist,
    );
    expect(s.cover).toEqual({ artist: "原曲の人", release: { date: "1999-03-05" } });
  });

  it("--unset で消す（中身が空になった credits ごと）", () => {
    expect(applySongChanges(base, { unset: ["credits.lyrics"] }, artist).credits).toEqual({ music: "B" });
    expect(applySongChanges(base, { unset: ["credits.lyrics", "credits.music"] }, artist).credits).toBeUndefined();
    const cleared = applySongChanges(base, { unset: ["tieups", "release"] }, artist);
    expect(cleared.tieups).toEqual([]);
    expect(cleared).not.toHaveProperty("release");
    expect(() => applySongChanges(base, { unset: ["id"] }, artist)).toThrow(/使えない/);
  });

  it("別表記は足す（重複は除く）。era はグループにあるものだけ", () => {
    expect(applySongChanges({ ...base, aliases: ["はつこい"] }, { aliases: ["はつこい", "合図"] }, artist).aliases).toEqual([
      "はつこい",
      "合図",
    ]);
    expect(applySongChanges(base, { era: "cover" }, artist).era).toBe("cover");
    expect(() => applySongChanges(base, { era: "3rd" }, artist)).toThrow(/unknown era/);
  });

  it("元の曲は変えない", () => {
    const before = JSON.stringify(base);
    applySongChanges(base, { credits: "編曲：C", unset: ["tieups"] }, artist);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("songDiff", () => {
  it("変わった項目だけを出す", () => {
    expect(songDiff(base, applySongChanges(base, { note: "メモ" }, artist))).toEqual(['note: （なし） → "メモ"']);
  });
});
