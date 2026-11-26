import { describe, expect, it } from "vitest";
import { costumeStats, eventCostume, heldCheck, type ResolvedEvent } from "./events.ts";
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
  id,
  date,
  title: `E${id}`,
  performers: [],
  types: ["external"],
  members: [],
  membersSource: "assumed",
  partialLineup: false,
  ...extra,
});

describe("eventCostume", () => {
  it("uses the latest regular costume, or the one given in overrides", () => {
    expect(eventCostume(artist, ev(1, "2026-10-01"), true)?.id).toBe("first");
    expect(eventCostume(artist, ev(2, "2027-02-01"), true)?.id).toBe("second");
    expect(eventCostume(artist, ev(3, "2026-10-31", { costume: "halloween" }), true)?.id).toBe("halloween");
  });

  it("does not guess for future events, events before any costume, or non-live events", () => {
    expect(eventCostume(artist, ev(4, "2027-07-01"), false)).toBeUndefined();
    expect(eventCostume(artist, ev(5, "2026-08-01"), true)).toBeUndefined();
    expect(eventCostume(artist, ev(6, "2026-10-01", { types: ["tokuten"] }), true)).toBeUndefined();
  });

  it("counts events per costume", () => {
    const events = [ev(1, "2026-10-01"), ev(2, "2026-10-31", { costume: "halloween" }), ev(3, "2026-11-01"), ev(4, "2027-07-01")];
    expect(costumeStats(artist, events, heldCheck("2027-06-01", [])).map((s) => [s.costume.id, s.count, s.first.id, s.last.id])).toEqual([
      ["first", 2, 1, 3],
      ["halloween", 1, 2, 2],
    ]);
  });
});

describe("heldCheck", () => {
  it("treats today's event as upcoming until its setlist is in", () => {
    const held = heldCheck("2026-11-18", [2]);
    expect(held(ev(1, "2026-11-17"))).toBe(true);
    expect(held(ev(2, "2026-11-18"))).toBe(true);
    expect(held(ev(3, "2026-11-18"))).toBe(false);
    expect(held(ev(4, "2026-11-19"))).toBe(false);
  });
});
