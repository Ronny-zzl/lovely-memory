import { describe, expect, it } from "vitest";
import { eventHasType, inferEventTypes, isLiveEvent, membersOn, memberStatus, orderMembers, resolveEvents } from "./events.ts";
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
    { pattern: "発売記念", type: ["release", "free"] },
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

describe("inferEventTypes", () => {
  it("collects every matching rule, else the default", () => {
    expect(inferEventTypes("着物チェキ会", artist)).toEqual(["tokuten"]);
    expect(inferEventTypes("TAIBAN LIVE「日進月歩」vol.16", artist)).toEqual(["taiban"]);
    expect(inferEventTypes("Second Season Debut LIVE", artist)).toEqual(["oneman"]);
    expect(inferEventTypes("IDOLGROW vol.30", artist)).toEqual(["external"]);
    // 並び順は種別の既定順（単独 → 主催対バン → …）
    expect(inferEventTypes("単独公演 日進月歩SP", artist)).toEqual(["oneman", "taiban"]);
    expect(inferEventTypes("シングル発売記念イベント", artist)).toEqual(["release", "free"]);
  });

  it("treats 主催対バン as a kind of 対バン", () => {
    expect(eventHasType({ types: ["taiban"] }, "external")).toBe(true);
    expect(eventHasType({ types: ["taiban"] }, "taiban")).toBe(true);
    expect(eventHasType({ types: ["external"] }, "taiban")).toBe(false);
    expect(eventHasType({ types: ["release", "free"] }, "free")).toBe(true);
  });

  it("treats tokuten / talk-only events as non-live", () => {
    expect(isLiveEvent({ types: ["tokuten"] })).toBe(false);
    expect(isLiveEvent({ types: ["talk"] })).toBe(false);
    expect(isLiveEvent({ types: ["tokuten", "talk"] })).toBe(false);
    expect(isLiveEvent({ types: ["release", "tokuten"] })).toBe(true);
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

  it("assumes only the members in the group on that day (joined later / left earlier)", () => {
    const changing = ArtistConfig.parse({
      ...artist,
      members: [
        { id: "a", name: "A", color: "#000000" },
        { id: "b", name: "B", color: "#111111", since: "2026-11-08" },
        { id: "c", name: "C", color: "#222222", until: "2026-11-30" },
      ],
    });
    const r = resolveEvents(events, Overrides.parse({}), changing);
    expect(r.find((e) => e.id === 3)).toMatchObject({ members: ["a", "b", "c"], membersSource: "assumed" });
    expect(r.find((e) => e.id === 4)).toMatchObject({ members: ["a", "b"], membersSource: "assumed" });
  });

  it("keeps eventernote performers when an override only changes other fields", () => {
    const ov = Overrides.parse({ events: { "2": { types: ["free"] } } });
    const r = resolveEvents(events, ov, artist);
    expect(r.find((e) => e.id === 2)).toMatchObject({ types: ["free"], members: ["a"], membersSource: "eventernote" });
  });

  it("marks partial-lineup events by title rule, overridable per event", () => {
    const a = ArtistConfig.parse({ ...artist, partialLineupRules: ["バースデーイベント"] });
    const out = resolveEvents(
      [ev(10, "2026-10-01", "ユイナ バースデーイベント 昼の部"), ev(11, "2026-10-02", "ライブ"), ev(12, "2026-10-03", "公開録音 1部")],
      Overrides.parse({ events: { "10": { partialLineup: false }, "12": { partialLineup: true } } }),
      a,
    );
    expect(out.map((e) => [e.id, e.partialLineup])).toEqual([
      [10, false],
      [11, false],
      [12, true],
    ]);
    const byRule = resolveEvents([ev(13, "2026-10-04", "チョコ バースデーイベント")], Overrides.parse({}), a);
    expect(byRule[0]!.partialLineup).toBe(true);
  });

  it("applies overrides and extra events", () => {
    const ov = Overrides.parse({
      events: {
        "4": { types: ["free", "release"], members: ["b"], title: "修正後タイトル" },
        "3": { hidden: true },
      },
      extraEvents: [{ id: -1, date: "2026-10-01", title: "手動追加", types: ["oneman"] }],
    });
    const r = resolveEvents(events, ov, artist);
    expect(r.map((e) => e.id)).toEqual([-1, 2, 4]);
    expect(r.find((e) => e.id === 4)).toMatchObject({
      types: ["release", "free"], // 既定の順に並べ替えられる
      members: ["b"],
      membersSource: "override",
      title: "修正後タイトル",
    });
    expect(r.find((e) => e.id === -1)!.types).toEqual(["oneman"]);
  });
});

describe("membersOn", () => {
  it("lists only the members in the group on that day", () => {
    const members = [{ id: "a" }, { id: "b", since: "2026-09-15" }, { id: "c", until: "2026-11-29" }];
    const ids = (date: string) => membersOn(members, date).map((m) => m.id);
    expect(ids("2026-09-14")).toEqual(["a", "c"]);
    expect(ids("2026-09-15")).toEqual(["a", "b", "c"]);
    expect(ids("2026-11-29")).toEqual(["a", "b", "c"]);
    expect(ids("2026-11-30")).toEqual(["a", "b"]);
  });
});

describe("memberStatus", () => {
  it("labels members only after their last day", () => {
    const rei = { until: "2026-11-29", untilLabel: "活動休止中" };
    expect(memberStatus(rei, "2026-11-29")).toBeUndefined();
    expect(memberStatus(rei, "2026-11-30")).toBe("活動休止中");
    expect(memberStatus({ until: "2026-01-01" }, "2026-11-30")).toBe("活動終了");
    expect(memberStatus({}, "2026-11-30")).toBeUndefined();
  });

  it("orders inactive members last, keeping the rest in order", () => {
    const ms = [{ id: "a" }, { id: "b", until: "2026-11-29" }, { id: "c" }];
    expect(orderMembers(ms, "2026-11-29").map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(orderMembers(ms, "2026-11-30").map((m) => m.id)).toEqual(["a", "c", "b"]);
  });
});
