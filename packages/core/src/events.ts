import type { ArtistConfig, Event, EventType, Overrides } from "./schema.ts";

export type ResolvedEvent = Event & {
  /** イベント種別（1 つ以上）。例: 単独公演かつフリーライブ */
  types: EventType[];
  /** 出演メンバー（member id） */
  members: string[];
  /**
   * members の根拠。
   * - override: overrides.json で指定
   * - eventernote: eventernote の出演者欄に個人名の登録があった
   * - assumed: 個人名の登録が無いため全員出演とみなした
   */
  membersSource: "override" | "eventernote" | "assumed";
  note?: string;
};

/** タイトルにマッチしたルールの種別をすべて返す（ルール順・重複なし）。無ければ defaultEventType */
export function inferEventTypes(title: string, artist: ArtistConfig): EventType[] {
  const types = artist.eventTypeRules.filter((r) => new RegExp(r.pattern, "i").test(title)).map((r) => r.type);
  return types.length ? [...new Set(types)] : [artist.defaultEventType];
}

/** ライブを伴うイベントか（特典会のみのイベントはセトリが存在しない） */
export function isLiveEvent(e: Pick<ResolvedEvent, "types">): boolean {
  return e.types.some((t) => t !== "tokuten");
}

/**
 * events.json（eventernote 由来の生データ）に overrides と artist.json のルールを適用し、
 * 表示・集計に使うイベント一覧を作る。日付昇順（同日は開演時刻→id 順）。
 */
export function resolveEvents(events: Event[], overrides: Overrides, artist: ArtistConfig): ResolvedEvent[] {
  const memberByEnId = new Map(
    artist.members.filter((m) => m.eventernoteId !== undefined).map((m) => [m.eventernoteId!, m.id]),
  );
  const allMembers = artist.members.map((m) => m.id);

  const merged: Array<Event & { types?: EventType[] }> = [...events, ...overrides.extraEvents];
  const out: ResolvedEvent[] = [];

  for (const base of merged) {
    const ov = overrides.events[String(base.id)] ?? {};
    if (ov.hidden) continue;
    const { types: ovTypes, members: ovMembers, hidden: _h, note, ...fields } = ov;
    const ev = { ...base, ...fields } as Event & { types?: EventType[] };

    if (artist.since && ev.date < artist.since) continue;
    if (artist.until && ev.date > artist.until) continue;

    let members: string[];
    let membersSource: ResolvedEvent["membersSource"];
    if (ovMembers) {
      members = ovMembers;
      membersSource = "override";
    } else {
      const listed = ev.performers.map((p) => memberByEnId.get(p)).filter((x): x is string => !!x);
      members = listed.length ? allMembers.filter((m) => listed.includes(m)) : allMembers;
      membersSource = listed.length ? "eventernote" : "assumed";
    }

    out.push({
      ...ev,
      types: ovTypes ?? ev.types ?? inferEventTypes(ev.title, artist),
      members,
      membersSource,
      note,
    });
  }

  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? "") || a.id - b.id,
  );
}
