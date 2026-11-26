import { describe, expect, it } from "vitest";
import type { ResolvedEvent } from "@lovely-memory/core";
import { extractPosts, matchPosts, partNumber, toJst, type CollectedTweet } from "./tweet-match.ts";

const ev = (id: number, date: string, start: string, title: string, type: ResolvedEvent["types"][number] = "external"): ResolvedEvent => ({
  id,
  date,
  start,
  title,
  types: [type],
  performers: [],
  members: [],
  membersSource: "assumed",
  partialLineup: false,
});

// JST の日時から ISO(UTC) を作る
const jst = (s: string) => new Date(`${s}:00+09:00`).toISOString();
const tw = (id: string, at: string, text: string, extra: Partial<CollectedTweet> = {}): CollectedTweet => ({
  id,
  url: `https://x.com/taiyototsukiyo/status/${id}`,
  time: jst(at),
  text,
  ...extra,
});

const events = [
  ev(1, "2026-10-03", "10:15", "「SELENE STADIUM」 20261003"),
  ev(2, "2026-10-04", "09:30", "クロフェス2026【DAY3】10/4"),
  ev(3, "2026-10-04", "18:00", "#ﾆｷﾌﾟﾚ『シキサイ。』"),
  ev(10, "2026-10-18", "11:45", "FREE LIVE 1部(2026.10.18)", "free"),
  ev(11, "2026-10-18", "15:30", "FREE LIVE 2部(2026.10.18)", "free"),
  ev(20, "2026-11-08", "12:30", "太陽と踊れ月夜に唄え TAIBAN LIVE「日進月歩」vol.16", "taiban"),
  ev(21, "2026-11-08", "18:00", "太陽と踊れ月夜に唄え単独公演「LOVEが目印♡」", "oneman"),
  ev(30, "2026-09-22", "14:00", "着物チェキ会", "tokuten"),
];

describe("helpers", () => {
  it("converts to JST and reads part numbers", () => {
    expect(toJst("2026-10-04T12:00:00.000Z")).toBe("2026-10-04T21:00");
    expect(partNumber("FREE LIVE 1部(2026.10.18)")).toBe(1);
    expect(partNumber("第２部")).toBe(2);
    expect(partNumber("二部")).toBe(2);
    expect(partNumber("SPARK DAY3")).toBeUndefined();
  });
});

describe("extractPosts", () => {
  it("drops posts without song lines and joins thread continuations", () => {
    const posts = extractPosts([
      tw("1", "2026-11-08T20:00", "本日もありがとうございました！"),
      tw("2", "2026-11-08T20:30", "【セトリ】\nM1_ もしも\nM2_ オトワ"),
      tw("3", "2026-11-08T20:31", "M3_ トランジション\nEN_ スプらっしゃい！"),
      tw("4", "2026-11-08T22:00", "M1_ はなうらNIGHT!"),
    ]);
    expect(posts.map((p) => [p.id, p.tweets.length])).toEqual([
      ["2", 2],
      ["4", 1],
    ]);
    expect(posts[0]!.stages[0]!.items.map((i) => i.title)).toEqual(["もしも", "オトワ", "トランジション", "スプらっしゃい！"]);
  });

  it("accepts unnumbered lists only when the post announces a setlist", () => {
    const posts = extractPosts([
      tw("u1", "2026-11-08T22:49", "☀️単独公演 セトリ🌙\n\nもしも\nオトワ\n\n#太陽月夜"),
      tw("u2", "2026-11-08T23:00", "デジタルシングル配信開始！\nラブリィフェリス\n作詞・作曲・編曲：夢魅たぴ"),
    ]);
    expect(posts.map((p) => [p.id, p.stages[0]!.items.map((i) => i.title)])).toEqual([["u1", ["もしも", "オトワ"]]]);
  });

  it("requires unnumbered lists to be mostly known songs when a song lookup is given", () => {
    const known = new Set(["もしも", "オトワ", "トランジション"]);
    const isKnownSong = (i: { title: string }) => known.has(i.title);
    const posts = extractPosts(
      [
        tw("k1", "2026-11-08T22:49", "単独公演 セトリ\nもしも\nオトワ\nトランジション"),
        tw("k2", "2026-10-17T11:34", "本日の #太陽月夜 🎤\nリリイベ セトリ投票受付中\n会場: タワーレコード新宿\n13:00〜\nもしも"),
        tw("k3", "2026-11-09T22:00", "セトリ\nもしも\nオトワ"),
      ],
      { isKnownSong },
    );
    expect(posts.map((p) => p.id)).toEqual(["k1"]);
  });

  it("splits a post that lists several parts", () => {
    const posts = extractPosts([tw("5", "2026-10-18T18:00", "【1部】\nM1_ もしも\n【2部】\nM1_ オトワ\nM2_ トランジション")]);
    expect(posts.map((p) => [p.part, p.stages[0]!.items.length])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});

describe("matchPosts", () => {
  const match = (tweets: CollectedTweet[], manual = {}) =>
    matchPosts(extractPosts(tweets), events, manual).map((r) => (r.kind === "matched" ? [r.post.id, r.event.id] : [r.post.id, r.kind]));

  it("ignores events that had not started when posted (1部 / 2部)", () => {
    expect(match([tw("a", "2026-10-18T13:10", "M1_ もしも"), tw("b", "2026-10-18T17:00", "M1_ オトワ")])).toEqual([
      ["a", 10],
      ["b", 11],
    ]);
  });

  it("uses discriminating hashtags when several events have started", () => {
    expect(match([tw("c", "2026-10-04T21:00", "#太陽月夜 #クロフェス2026 セトリ\nM1_ もしも")])).toEqual([["c", 2]]);
  });

  it("uses the post header against event titles, ignoring the group name", () => {
    const r = matchPosts(
      extractPosts([tw("i", "2026-11-08T22:26", "TAIBAN LIVE「日進月歩」vol.16 セトリ⭐️\n\nM1_ もしも\n\n#太陽月夜")]),
      events,
      {},
      ["太陽と踊れ月夜に唄え"],
    );
    expect(r[0]).toMatchObject({ kind: "matched", event: { id: 20 } });
  });

  it("splits parts whose header has trailing text", () => {
    const text = "発売記念イベント セトリ⭐️\n【1部】もえちゃん考案セトリ❤️\nM1_ もしも\n【2部】\nM1_ オトワ";
    expect(match([tw("j", "2026-10-18T20:24", text)])).toEqual([
      ["j", 10],
      ["j", 11],
    ]);
    expect(extractPosts([tw("j", "2026-10-18T20:24", text)])[0]!.stages[0]!.note).toBe("もえちゃん考案セトリ❤️");
  });

  it("reports ambiguity when nothing discriminates", () => {
    expect(match([tw("d", "2026-11-08T21:00", "#太陽月夜 セトリ\nM1_ もしも")])).toEqual([["d", "ambiguous"]]);
  });

  it("falls back to the previous day for posts after midnight", () => {
    // 10/4 の公演はまだ始まっていないので、前日 10/3 の公演に対応する
    expect(match([tw("e", "2026-10-04T00:30", "M1_ もしも")])).toEqual([["e", 1]]);
  });

  it("does not guess between parts that both ended before the post", () => {
    expect(match([tw("e", "2026-10-19T00:30", "M1_ もしも"), tw("f", "2026-10-19T00:40", "M1_ オトワ")])).toEqual([
      ["e", "ambiguous"],
      ["f", "ambiguous"],
    ]);
  });

  it("prefers a date written in the post header", () => {
    expect(match([tw("g", "2026-10-05T12:00", "10/3 SELENE STADIUM セトリ\nM1_ もしも")])).toEqual([["g", 1]]);
  });

  it("never matches tokuten events and respects manual mapping", () => {
    expect(match([tw("h", "2026-09-22T18:00", "M1_ もしも")])).toEqual([["h", "unmatched"]]);
    expect(match([tw("d", "2026-11-08T21:00", "M1_ もしも")], { d: 21 })).toEqual([["d", 21]]);
    expect(match([tw("d", "2026-11-08T21:00", "M1_ もしも")], { d: "skip" })).toEqual([]);
  });
});
