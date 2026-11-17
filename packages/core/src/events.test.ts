import { describe, expect, it } from "vitest";
import { inferEventType, resolveEvents } from "./events.ts";
import { ArtistConfig, Overrides, type Event } from "./schema.ts";

const artist = ArtistConfig.parse({
  id: "test",
  name: "Test",
  since: "2026-09-04",
  members: [
    { id: "a", name: "A", color: "#000000", eventernoteId: 1 },
    { id: "b", name: "B", color: "#111111", eventernoteId: 2 },
  ],
  sources: {},
  eventTypeRules: [
    { pattern: "チェキ会", type: "tokuten" },
    { pattern: "日進月歩", type: "taiban" },
    { pattern: "Debut LIVE|単独公演", type: "oneman" },
  ],
  defaultEventType: "external",
});

const ev = (id: number, date: string, title: string, performers: number[] = [], start?: string): Event => ({
  id,
  date,
  title,
  performers,
  start,
});

describe("inferEventType", () => {
  it("uses the first matching rule, else default", () => {
    expect(inferEventType("着物チェキ会", artist)).toBe("tokuten");
    expect(inferEventType("TAIBAN LIVE「日進月歩」vol.16", artist)).toBe("taiban");
    expect(inferEventType("Second Season Debut LIVE", artist)).toBe("oneman");
    expect(inferEventType("IDOLGROW vol.30", artist)).toBe("external");
  });
});

describe("resolveEvents", () => {
  const events = [
    ev(3, "2026-11-08", "単独公演", [99, 1, 2], "18:00"),
    ev(2, "2026-11-08", "TAIBAN LIVE「日進月歩」", [99, 1], "14:00"),
    ev(1, "2026-04-28", "合同卒業公演", [99]),
    ev(4, "2026-12-01", "外部フェス", [99]),
  ];

  it("filters by since, sorts by date and start time", () => {
    const r = resolveEvents(events, Overrides.parse({}), artist);
    expect(r.map((e) => e.id)).toEqual([2, 3, 4]);
  });

  it("derives members from eventernote performers, or assumes everyone", () => {
    const r = resolveEvents(events, Overrides.parse({}), artist);
    expect(r.find((e) => e.id === 2)).toMatchObject({ members: ["a"], membersSource: "eventernote" });
    expect(r.find((e) => e.id === 4)).toMatchObject({ members: ["a", "b"], membersSource: "assumed" });
  });

  it("applies overrides and extra events", () => {
    const ov = Overrides.parse({
      events: {
        "4": { type: "free", members: ["b"], title: "修正後タイトル" },
        "3": { hidden: true },
      },
      extraEvents: [{ id: -1, date: "2026-10-01", title: "手動追加", type: "oneman" }],
    });
    const r = resolveEvents(events, ov, artist);
    expect(r.map((e) => e.id)).toEqual([-1, 2, 4]);
    expect(r.find((e) => e.id === 4)).toMatchObject({
      type: "free",
      members: ["b"],
      membersSource: "override",
      title: "修正後タイトル",
    });
    expect(r.find((e) => e.id === -1)!.type).toBe("oneman");
  });
});
