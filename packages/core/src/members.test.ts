import { heldCheck } from "./events.ts";
import { describe, expect, it } from "vitest";
import type { ResolvedEvent } from "./events.ts";
import { computeMemberStats } from "./members.ts";
import { ArtistConfig, Setlist, Song } from "./schema.ts";
import { computeStats } from "./stats.ts";

const artist = ArtistConfig.parse({
  id: "t",
  name: "T",
  members: [
    { id: "a", name: "A", color: "#000000" },
    { id: "b", name: "B", color: "#111111" },
  ],
  sources: {},
});

const ev = (id: number, date: string, members: string[], types: ResolvedEvent["types"] = ["external"]): ResolvedEvent => ({
  id,
  date,
  title: `E${id}`,
  performers: [],
  types,
  members,
  membersSource: "eventernote",
  partialLineup: false,
});

const events = [
  ev(1, "2026-09-04", ["a", "b"]),
  ev(2, "2026-09-10", ["a"]), // b 欠席
  ev(3, "2026-09-22", ["a", "b"], ["tokuten"]), // 特典会は対象外
  ev(4, "2026-09-30", ["b"]), // a 欠席、セトリ未登録
  ev(5, "2026-12-01", ["a"]), // 未来の公演は対象外
];
const songs = [Song.parse({ id: "s1", title: "X" }), Song.parse({ id: "s2", title: "Y" })];
const setlists = [Setlist.parse({ event: 1, items: ["X", { song: "Y", members: ["a"] }] }), Setlist.parse({ event: 2, items: ["X"] })];

describe("computeMemberStats", () => {
  const stats = computeStats({ songs, events, setlists });
  const [a, b] = computeMemberStats({
    artist,
    events,
    stats,
    held: heldCheck(
      "2026-11-18",
      setlists.map((s) => s.event),
    ),
  });

  it("counts appearances over held live events only", () => {
    expect(a).toMatchObject({ appearances: 2, total: 3 });
    expect(b).toMatchObject({ appearances: 2, total: 3 });
    expect(a!.rate).toBeCloseTo(2 / 3);
  });

  it("does not count members who were never scheduled for a partial-lineup event (birthday events etc.)", () => {
    const partial = { ...ev(6, "2026-10-10", ["a"]), partialLineup: true };
    const withPartial = [...events, partial];
    const [pa, pb] = computeMemberStats({
      artist,
      events: withPartial,
      stats: computeStats({ songs, events: withPartial, setlists }),
      held: heldCheck(
        "2026-11-18",
        setlists.map((s) => s.event),
      ),
    });
    // a は出演として数える。b は欠席にも分母にも入れない
    expect(pa).toMatchObject({ appearances: 3, total: 4 });
    expect(pb).toMatchObject({ appearances: 2, total: 3 });
    expect(pb!.absences.map((e) => e.id)).toEqual([2]);
  });

  it("lists absences in date order", () => {
    expect(a!.absences.map((e) => e.id)).toEqual([4]);
    expect(b!.absences.map((e) => e.id)).toEqual([2]);
  });

  it("counts only the events while the member was in the group", () => {
    const joined = ArtistConfig.parse({ ...artist, members: [artist.members[0], { ...artist.members[1], since: "2026-09-15" }] });
    const [, late] = computeMemberStats({
      artist: joined,
      events,
      stats,
      held: heldCheck(
        "2026-11-18",
        setlists.map((s) => s.event),
      ),
    });
    // 加入（9/15）前の e1・e2 は数えない：e4 だけ
    expect(late).toMatchObject({ appearances: 1, total: 1 });
    expect(late!.absences).toEqual([]);
  });

  it("counts performances using per-item members", () => {
    // a: e1 の X と Y、e2 の X / b: e1 の X のみ（Y は a だけ）
    expect(a!.performances).toBe(3);
    expect(b!.performances).toBe(1);
  });
});
