import { describe, expect, it } from "vitest";
import type { ResolvedEvent } from "./events.ts";
import { computePatterns, neighbors, positionRole, zoneOf } from "./patterns.ts";
import { Setlist, Song } from "./schema.ts";
import { computeStats } from "./stats.ts";

const titles = ["A", "B", "C", "D", "E", "F"];
const songs = titles.map((t, i) => Song.parse({ id: `s${i + 1}`, title: t }));

const ev = (id: number): ResolvedEvent => ({
  id,
  date: `2026-10-${String(id).padStart(2, "0")}`,
  title: `E${id}`,
  performers: [],
  types: ["external"],
  members: [],
  membersSource: "assumed",
});

const setlists = [
  Setlist.parse({ event: 1, items: ["A", "B", "C", "D", { song: "E", encore: true }, { song: "A", encore: true }] }),
  Setlist.parse({ event: 2, items: ["F", "B", "C", "D"] }),
  Setlist.parse({ event: 3, items: ["A", "B", "C", "D"] }),
  // コラボステージは対象外
  Setlist.parse({ event: 4, stages: [{ items: ["E", "B"] }, { collab: true, items: ["B", "C", "D"] }] }),
  Setlist.parse({ event: 5, items: ["C"] }),
];

const stats = computeStats({ songs, events: [1, 2, 3, 4, 5].map(ev), setlists });
const patterns = computePatterns(stats.events);
const at = (title: string) => patterns.positions.find((p) => p.song.title === title)!;

describe("zoneOf", () => {
  it("splits the main set into thirds", () => {
    expect([0, 1, 2, 3, 4].map((i) => zoneOf(i, 5))).toEqual(["early", "early", "middle", "late", "late"]);
    expect(zoneOf(0, 1)).toBeUndefined();
  });
});

describe("computePatterns", () => {
  it("counts positions in the main set, excluding collab stages", () => {
    expect(patterns.stages).toBe(5);
    expect(at("D")).toMatchObject({ count: 3, opener: 0, closer: 3, zones: { early: 0, middle: 0, late: 3 } });
    expect(at("A")).toMatchObject({ count: 2, opener: 2, closer: 0 });
    // E: e4 の 1 曲目 + e1 のアンコール
    expect(at("E")).toMatchObject({ count: 1, opener: 1, encore: 1 });
    // 1 曲だけのステージは 1 曲目かつラストだが、前半/後半には数えない
    expect(at("C")).toMatchObject({ count: 4, opener: 1, closer: 1, zones: { early: 0, middle: 3, late: 0 } });
  });

  it("counts transitions within the main set", () => {
    const bc = patterns.transitions.find((t) => t.from.title === "B" && t.to.title === "C")!;
    expect(bc).toMatchObject({ count: 3, fromCount: 3 });
    expect(patterns.transitions[0]).toBe(bc);
    // 本編ラスト → アンコール（D → E）は数えない
    expect(patterns.transitions.some((t) => t.from.title === "D")).toBe(false);
  });

  it("counts transitions within the encore", () => {
    const ea = patterns.transitions.find((t) => t.from.title === "E" && t.to.title === "A")!;
    expect(ea).toMatchObject({ count: 1, fromCount: 2 });
    expect(at("A")).toMatchObject({ count: 2, opener: 2, encore: 1 });
  });

  it("finds maximal recurring chains", () => {
    expect(patterns.chains.map((c) => [c.songs.map((s) => s.title).join(""), c.count])).toEqual([["BCD", 3]]);
    const withTwo = computePatterns(stats.events, { minChainCount: 2 });
    expect(withTwo.chains.map((c) => [c.songs.map((s) => s.title).join(""), c.count])).toEqual([
      ["BCD", 3],
      ["ABCD", 2],
    ]);
  });

  it("lists neighbours of a song", () => {
    const n = neighbors(patterns, "s2");
    expect(n.before.map((t) => [t.from.title, t.count])).toEqual([
      ["A", 2],
      ["F", 1],
      ["E", 1],
    ]);
    expect(n.after.map((t) => [t.to.title, t.count])).toEqual([["C", 3]]);
  });
});

describe("positionRole", () => {
  it("marks songs almost always sung first or last", () => {
    expect(positionRole(at("D"), { minCount: 3 })).toBe("closer");
    expect(positionRole(at("D"))).toBeUndefined();
    expect(positionRole(at("A"), { minCount: 2 })).toBe("opener");
    expect(positionRole(at("C"), { minCount: 2 })).toBeUndefined();
  });
});
