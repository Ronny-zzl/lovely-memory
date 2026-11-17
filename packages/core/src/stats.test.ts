import { describe, expect, it } from "vitest";
import type { ResolvedEvent } from "./events.ts";
import { Setlist, Song } from "./schema.ts";
import { computeStats } from "./stats.ts";

const song = (id: string, title: string) => Song.parse({ id, title });
const songs = [song("s1", "A"), song("s2", "B"), song("s3", "C"), song("s4", "D")];

const ev = (id: number, date: string, type: ResolvedEvent["types"][number] = "oneman"): ResolvedEvent => ({
  id,
  date,
  title: `E${id}`,
  performers: [],
  types: [type],
  members: ["x", "y"],
  membersSource: "assumed",
});

// e1: A B / e2(2ステージ): [A C] [A] / e3: セトリ無し / e4(release): B
const events = [ev(1, "2026-09-04"), ev(2, "2026-10-04", "external"), ev(3, "2026-10-10"), ev(4, "2027-01-02", "release")];
const setlists = [
  Setlist.parse({ event: 1, items: ["A", { song: "B", encore: true, members: ["x"] }] }),
  Setlist.parse({ event: 2, stages: [{ name: "S1", items: ["A", "C"] }, { name: "S2", items: ["a"] }] }),
  Setlist.parse({ event: 4, items: ["B"] }),
];

describe("computeStats", () => {
  const stats = computeStats({ songs, events, setlists });
  const by = (id: string) => stats.songs.find((s) => s.song.id === id)!;

  it("counts performances, stages and events separately", () => {
    expect(by("s1")).toMatchObject({ count: 3, stages: 3, events: 2 });
    expect(by("s2")).toMatchObject({ count: 2, stages: 2, events: 2 });
    expect(by("s3")).toMatchObject({ count: 1, stages: 1, events: 1 });
  });

  it("uses events with setlists since the debut as the denominator", () => {
    expect(stats.events.map((e) => e.event.id)).toEqual([1, 2, 4]);
    expect(by("s1")).toMatchObject({ events: 2, eligibleEvents: 3 });
    expect(by("s1").rate).toBeCloseTo(2 / 3);
    // C は e2 で初披露 → 分母は e2, e4 の 2 公演
    expect(by("s3")).toMatchObject({ events: 1, eligibleEvents: 2, rate: 0.5 });
    expect(by("s4")).toMatchObject({ eligibleEvents: 0, rate: 0 });
    expect(stats.totalStages).toBe(4);
    expect(stats.totalPerformances).toBe(6);
  });

  it("derives first/last, debut flags and events since last", () => {
    expect(by("s1").first).toEqual({ eventId: 1, date: "2026-09-04" });
    expect(by("s1").last).toEqual({ eventId: 2, date: "2026-10-04" });
    expect(by("s1").sinceLast).toBe(1);
    expect(by("s2").sinceLast).toBe(0);
    expect(by("s1").performances.map((p) => p.debut)).toEqual([true, false, false]);
    expect(by("s4")).toMatchObject({ count: 0, sinceLast: null, first: undefined });
  });

  it("keeps per-item members/encore and counts by year", () => {
    const b = stats.events[0]!.stages[0]!.entries[1]!;
    expect(b).toMatchObject({ encore: true, members: ["x"], position: 2 });
    expect(by("s2").byYear).toEqual({ "2026": 1, "2027": 1 });
  });

  it("can leave collab stages out", () => {
    const withCollab = [
      ...setlists.filter((s) => s.event !== 4),
      Setlist.parse({
        event: 4,
        stages: [
          { items: ["B"] },
          { name: "コラボ", collab: true, items: [{ song: "D", members: ["x"], with: ["他グループの誰か"] }] },
        ],
      }),
    ];
    const all = computeStats({ songs, events, setlists: withCollab });
    expect(all.songs.find((s) => s.song.id === "s4")).toMatchObject({ count: 1 });
    expect(all.songs.find((s) => s.song.id === "s4")!.performances[0]).toMatchObject({
      collab: true,
      members: ["x"],
      with: ["他グループの誰か"],
    });
    const noCollab = computeStats({ songs, events, setlists: withCollab, includeCollab: false });
    expect(noCollab.songs.find((s) => s.song.id === "s4")).toMatchObject({ count: 0 });
    expect(noCollab.events.find((e) => e.event.id === 4)!.stages).toHaveLength(1);
  });

  it("applies the event filter before computing", () => {
    const onlyOneman = computeStats({ songs, events, setlists, filter: (e) => e.types.includes("oneman") });
    expect(onlyOneman.events.map((e) => e.event.id)).toEqual([1]);
    expect(onlyOneman.songs.find((s) => s.song.id === "s1")).toMatchObject({ count: 1, rate: 1 });
  });
});
