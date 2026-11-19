import { describe, expect, it } from "vitest";
import { Song, type ResolvedEvent } from "@lovely-memory/core";
import type { CollectedTweet } from "./tweet-match.ts";
import { postText } from "./x-api.ts";
import { decide, pendingEvents, prune } from "./x-watch.ts";

const ev = (id: number, date: string, start: string, title: string): ResolvedEvent => ({
  id,
  date,
  start,
  title,
  types: ["taiban"],
  performers: [],
  members: [],
  membersSource: "assumed",
});
const jst = (s: string) => new Date(`${s}:00+09:00`);
const tw = (id: string, at: string, text: string): CollectedTweet => ({
  id,
  url: `https://x.com/taiyototsukiyo/status/${id}`,
  time: jst(at).toISOString(),
  text,
});
const songs = ["宣言前夜", "対戦ありがとうございました", "もしも", "君宛て紙ヒコーキ", "ラブリィフェリス"].map((title, i) =>
  Song.parse({ id: `s${i}`, title }),
);

const events = [ev(1, "2026-11-18", "19:00", "#ﾆｷﾌﾟﾚ「セイエン。」2026.11.18"), ev(2, "2026-11-19", "19:00", "次の日のライブ")];
const SETLIST =
  "#ﾆｷﾌﾟﾚ『セイエン。』 セトリ📣\n\nM1_ 宣言前夜\n作詞：中村彼方\n\nM2_ 対戦ありがとうございました\n\nM3_ もしも\n\n #太陽月夜";

const run = (tweets: CollectedTweet[], now: string, opts: { has?: number[]; handled?: string[] } = {}) =>
  decide({
    tweets,
    events,
    songs,
    artistName: "太陽と踊れ月夜に唄え",
    hasSetlist: (id) => (opts.has ?? []).includes(id),
    handled: new Set(opts.handled),
    now: jst(now),
  });

describe("pendingEvents", () => {
  it("waits from the start time for WATCH_HOURS, only for events without a setlist", () => {
    const at = (now: string, has: number[] = []) => pendingEvents(events, (id) => has.includes(id), jst(now)).map((e) => e.id);
    expect(at("2026-11-18T18:59")).toEqual([]);
    expect(at("2026-11-18T19:00")).toEqual([1]);
    expect(at("2026-11-19T03:00")).toEqual([1]);
    expect(at("2026-11-19T03:01")).toEqual([]);
    expect(at("2026-11-18T22:00", [1])).toEqual([]);
  });
});

describe("decide", () => {
  it("imports a settled setlist announcement", () => {
    const [d] = run([tw("100", "2026-11-18T21:55", SETLIST)], "2026-11-18T22:15");
    expect(d).toMatchObject({ kind: "import", key: "100", event: { id: 1 } });
    if (d?.kind !== "import") throw new Error();
    expect(d.setlist).toMatchObject({
      event: 1,
      source: "https://x.com/taiyototsukiyo/status/100",
      items: ["宣言前夜", "対戦ありがとうございました", "もしも"],
    });
  });

  it("waits for thread continuations before importing", () => {
    expect(run([tw("100", "2026-11-18T21:55", SETLIST)], "2026-11-18T22:10")).toEqual([]);
    const thread = [tw("100", "2026-11-18T21:55", SETLIST), tw("101", "2026-11-18T21:56", "M4_ 君宛て紙ヒコーキ\nM5_ ラブリィフェリス")];
    const [d] = run(thread, "2026-11-18T22:20");
    if (d?.kind !== "import") throw new Error(d?.kind);
    expect(d.setlist.items).toHaveLength(5);
  });

  it("does not overwrite existing setlists or repeat handled posts", () => {
    expect(run([tw("100", "2026-11-18T21:55", SETLIST)], "2026-11-18T22:30", { has: [1] })).toEqual([
      { kind: "ignore", key: "100", reason: "1 はセトリ登録済み" },
    ]);
    expect(run([tw("100", "2026-11-18T21:55", SETLIST)], "2026-11-18T22:30", { handled: ["100"] })).toEqual([]);
  });

  it("reports unknown songs instead of importing", () => {
    const [d] = run([tw("100", "2026-11-18T21:55", `${SETLIST}\nM4_ 知らない新曲`)], "2026-11-18T22:30");
    expect(d).toMatchObject({ kind: "unknown-songs", unknown: ["知らない新曲"] });
  });

  it("ignores numbered lists that are not setlist announcements", () => {
    expect(run([tw("100", "2026-11-18T21:55", "NEW EP 収録曲\nM1_ 宣言前夜\nM2_ もしも")], "2026-11-18T22:30")).toEqual([]);
  });
});

describe("x-api helpers", () => {
  it("prefers the long-post text, unescapes entities and drops t.co links", () => {
    const text = postText({
      id: "1",
      created_at: "",
      text: "short… https://t.co/abc",
      note_tweet: { text: "M1_ A&amp;B &lt;3 https://t.co/xyz\nM2_ C" },
    });
    expect(text).toBe("M1_ A&B <3\nM2_ C");
  });

  it("prunes old posts", () => {
    expect(prune([tw("1", "2026-11-17T09:00", "a"), tw("2", "2026-11-18T09:00", "b")], jst("2026-11-18T22:00")).map((t) => t.id)).toEqual([
      "2",
    ]);
  });
});
