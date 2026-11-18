import { describe, expect, it } from "vitest";
import { costumeStats, eventCostume, type ResolvedEvent } from "./events.ts";
import { ArtistConfig } from "./schema.ts";

const artist = ArtistConfig.parse({
  id: "a",
  name: "A",
  members: [],
  sources: {},
  costumes: [
    { id: "first", name: "1st 衣装", since: "2026-09-04" },
    { id: "second", name: "2nd 衣装", since: "2027-01-01" },
    { id: "halloween", name: "ハロウィン衣装", special: true },
  ],
});
const ev = (id: number, date: string, extra: Partial<ResolvedEvent> = {}): ResolvedEvent => ({
  id, date, title: `E${id}`, performers: [], types: ["external"], members: [], membersSource: "assumed", ...extra,
});

describe("eventCostume", () => {
  it("uses the latest regular costume, or the one given in overrides", () => {
    expect(eventCostume(artist, ev(1, "2026-10-01"), "2027-06-01")?.id).toBe("first");
    expect(eventCostume(artist, ev(2, "2027-02-01"), "2027-06-01")?.id).toBe("second");
    expect(eventCostume(artist, ev(3, "2026-10-31", { costume: "halloween" }), "2027-06-01")?.id).toBe("halloween");
  });

  it("does not guess for future events, events before any costume, or non-live events", () => {
    expect(eventCostume(artist, ev(4, "2027-07-01"), "2027-06-01")).toBeUndefined();
    expect(eventCostume(artist, ev(5, "2026-08-01"), "2027-06-01")).toBeUndefined();
    expect(eventCostume(artist, ev(6, "2026-10-01", { types: ["tokuten"] }), "2027-06-01")).toBeUndefined();
  });

  it("counts events per costume", () => {
    const events = [ev(1, "2026-10-01"), ev(2, "2026-10-31", { costume: "halloween" }), ev(3, "2026-11-01"), ev(4, "2027-07-01")];
    expect(costumeStats(artist, events, "2027-06-01").map((s) => [s.costume.id, s.count, s.first.id, s.last.id])).toEqual([
      ["first", 2, 1, 3],
      ["halloween", 1, 2, 2],
    ]);
  });
});
