import { describe, expect, it } from "vitest";
import { heldCheck, type ResolvedEvent } from "./events.ts";
import { computeMilestones, debutDayMilestones, isSongCountMilestone, upcomingMilestones } from "./milestones.ts";
import { Setlist, Song } from "./schema.ts";
import { computeStats } from "./stats.ts";

const songs = [Song.parse({ id: "s1", title: "A" }), Song.parse({ id: "s2", title: "B" }), Song.parse({ id: "s3", title: "C" })];
const day = (i: number) => new Date(Date.UTC(2026, 8, 4 + i)).toISOString().slice(0, 10);
const ev = (i: number): ResolvedEvent => ({
  id: 1000 + i,
  date: day(i),
  title: `E${i}`,
  performers: [],
  types: ["external"],
  members: [],
  membersSource: "assumed",
});

// イベント 0..11（12 イベント）。A は毎回、B は 0 と 9 だけ（9 回ぶり）、C は 0..4（5 連続）
const events = Array.from({ length: 12 }, (_, i) => ev(i));
const setlists = events.map((e, i) =>
  Setlist.parse({ event: e.id, items: ["A", ...(i === 0 || i === 9 ? ["B"] : []), ...(i <= 4 ? ["C"] : [])] }),
);
const stats = computeStats({ songs, events, setlists });
const today = day(11);
const held = heldCheck(
  day(12),
  setlists.map((s) => s.event),
);
const m = computeMilestones({ stats, liveEvents: events, since: day(0), today, held });
const of = (kind: string) => m.achieved.filter((x) => x.kind === kind);

describe("computeMilestones", () => {
  it("finds song count, streak and return milestones", () => {
    expect(isSongCountMilestone(10)).toBe(true);
    expect(isSongCountMilestone(110)).toBe(false);
    expect(of("song-count").map((x) => x.kind === "song-count" && [x.song.title, x.count, x.date])).toEqual([["A", 10, day(9)]]);
    expect(of("song-streak").map((x) => x.kind === "song-streak" && [x.song.title, x.streak])).toEqual([
      ["A", 5],
      ["C", 5],
      ["A", 10],
    ]);
    expect(of("song-return").map((x) => x.kind === "song-return" && [x.song.title, x.gap, x.eventId])).toEqual([["B", 9, 1009]]);
  });

  it("tracks current and longest streaks", () => {
    expect(m.songs.get("s1")).toMatchObject({ currentStreak: 12, longestStreak: 12, nextCount: 20 });
    expect(m.songs.get("s3")).toMatchObject({ currentStreak: 0, longestStreak: 5, longestStreakEnd: { eventId: 1004 } });
  });

  it("counts held events and total songs", () => {
    expect(m.eventCount).toBe(12);
    expect(of("event-count").map((x) => x.kind === "event-count" && x.count)).toEqual([10]);
    // 1 + 1 + 5 + 12 = 19 曲。100 曲には届かない
    expect(m.totalSongs).toBe(19);
    expect(of("total-songs")).toEqual([]);
  });

  it("adds days since the debut", () => {
    expect(debutDayMilestones("2026-09-04", "2027-09-04").map((d) => [d.date, d.days, d.years])).toEqual([
      ["2026-12-13", 100, undefined],
      ["2027-03-23", 200, undefined],
      ["2027-07-01", 300, undefined],
      ["2027-09-04", 0, 1],
    ]);
  });
});

describe("upcomingMilestones", () => {
  it("lists what the next event could bring", () => {
    const next = { ...ev(12), date: day(12) };
    const up = upcomingMilestones({ milestones: m, stats, liveEvents: [...events, next], since: day(0), today, held, maxRemaining: 8 });
    // 残り回数の少ない順、同じなら歌唱率の高い順（A は毎回歌われているので B より先）
    expect(up.filter((u) => u.kind === "song-count").map((u) => u.kind === "song-count" && [u.song.title, u.remaining])).toEqual([
      ["C", 5],
      ["A", 8],
      ["B", 8],
    ]);
    // A は次も歌えば 13 連続（節目ではない）
    expect(up.some((u) => u.kind === "song-streak")).toBe(false);
    // 既定（あと 2 回以内）では何も出ない
    expect(
      upcomingMilestones({ milestones: m, stats, liveEvents: [...events, next], since: day(0), today, held }).filter(
        (u) => u.kind === "song-count",
      ),
    ).toEqual([]);
  });

  it("flags the next event when it is a round number", () => {
    const more = Array.from({ length: 13 }, (_, i) => ev(12 + i));
    const all = [...events, ...more];
    // 当日（day 24）の公演はセトリが無いので、まだ開催予定
    const held24 = heldCheck(
      day(24),
      setlists.map((s) => s.event),
    );
    const ms = computeMilestones({ stats, liveEvents: all, since: day(0), today: day(24), held: (e) => e.date < day(24) || held24(e) });
    expect(ms.eventCount).toBe(24);
    const up = upcomingMilestones({ milestones: ms, stats, liveEvents: all, since: day(0), today: day(24), held: held24 });
    expect(up.find((u) => u.kind === "event-count")).toMatchObject({ count: 25, event: { id: 1024 } });
  });
});
