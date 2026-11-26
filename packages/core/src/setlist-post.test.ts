import { describe, expect, it } from "vitest";
import { setlistPostText, xTextLength } from "./setlist-post.ts";
import type { ArtistConfig } from "./schema.ts";
import type { EventSetlist, SetlistEntry } from "./stats.ts";

const artist = {
  name: "グループ",
  shareHashtags: ["共有"],
  members: [
    { id: "a", name: "あい" },
    { id: "b", name: "びい" },
  ],
} as unknown as ArtistConfig;
const entry = (no: string, title: string, extra: Partial<SetlistEntry> = {}): SetlistEntry =>
  ({ no, song: { title }, members: ["a", "b"], encore: no.startsWith("EN"), debut: false, position: 0, ...extra }) as SetlistEntry;
const setlist = (stages: EventSetlist["stages"], extra: Partial<EventSetlist> = {}): EventSetlist =>
  ({ event: { date: "2026-09-22", title: "ライブ", members: ["a", "b"] }, unknownSongs: 0, stages, ...extra }) as EventSetlist;
const stage = (entries: SetlistEntry[], extra: Partial<EventSetlist["stages"][number]> = {}) => ({
  collab: false,
  members: [],
  entries,
  ...extra,
});

describe("setlistPostText", () => {
  it("日付・グループ・イベント名、曲順、セトリ用のハッシュタグ（URL は付けない）", () => {
    const sl = setlist([stage([entry("M1", "曲A"), entry("M2", "曲B"), entry("EN", "曲C")])]);
    expect(setlistPostText({ ...artist, setlistHashtags: ["セトリ", "タグ"] }, sl)).toBe(
      ["2026.09.22 グループ\nライブ", "M1 曲A\nM2 曲B\nEN 曲C", "#セトリ #タグ"].join("\n\n"),
    );
    // セトリ用が無ければ共有ボタンのハッシュタグ
    expect(setlistPostText(artist, sl).endsWith("\n\n#共有")).toBe(true);
  });

  it("一部のメンバー・一緒に歌った人・メモを添え、名前のあるステージに見出し", () => {
    const text = setlistPostText(
      artist,
      setlist([
        stage([entry("M1", "曲A", { members: ["a"], note: "short ver." })]),
        stage([entry("M1", "曲B", { members: ["b"], with: ["ゲスト1", "ゲスト2"] })], { name: "コラボステージ", collab: true }),
      ]),
    );
    expect(text).toContain("M1 曲A（あい／short ver.）\n\n【コラボステージ】\nM1 曲B（びい with ゲスト1・ゲスト2）");
  });

  it("思い出せない曲の番号には「？」、記録の揃い具合の注意書き", () => {
    const text = setlistPostText(artist, setlist([stage([entry("M1", "曲A"), entry("M4", "曲B")])], { unknownSongs: 2 }));
    expect(text).toContain("M1 曲A\nM2 ？\nM3 ？\nM4 曲B\n\n※一部の曲だけの記録です");
    expect(setlistPostText(artist, setlist([stage([entry("M1", "曲A")])], { completeness: "unordered" }))).toContain(
      "※曲順は分かっていません",
    );
  });
});

describe("xTextLength", () => {
  it("日本語は 2、英数字は 1、URL は 23", () => {
    expect(xTextLength("abc")).toBe(3);
    expect(xTextLength("曲名")).toBe(4);
    expect(xTextLength("見て https://example.com/very/long/path")).toBe(4 + 1 + 23);
  });
});
