import type { ArtistConfig, Event, EventType, Member, Overrides } from "./schema.ts";

export type ResolvedEvent = Event & {
  /** イベント種別（1 つ以上）。例: 単独公演かつフリーライブ */
  types: EventType[];
  /** 出演メンバー（member id） */
  members: string[];
  /**
   * members の根拠。
   * - override: overrides.json で指定
   * - eventernote: eventernote の出演者欄に個人名の登録があった
   * - assumed: 個人名の登録が無いため、その日に在籍していた全員の出演とみなした
   */
  membersSource: "override" | "eventernote" | "assumed";
  note?: string;
  /** overrides で指定した衣装（指定が無ければ eventCostume で既定を求める） */
  costume?: string;
  /**
   * 出演するメンバーが初めから一部だけのイベント（生誕・公開録音の各部など。artist.json の partialLineupRules か overrides）。
   * 出演しなかったメンバーは欠席ではない
   */
  partialLineup: boolean;
};

/** 表示・保存時の種別の並び順 */
const TYPE_ORDER: EventType[] = ["oneman", "taiban", "external", "release", "free", "tokuten", "talk"];

/** ライブが無い種別（特典会・トーク）。セトリが無く、統計にも入れない */
const NON_LIVE_TYPES = new Set<EventType>(["tokuten", "talk"]);

/** 種別の包含関係（子 → 親）。主催対バンは対バンの一種 */
export const EVENT_TYPE_PARENT: Partial<Record<EventType, EventType>> = { taiban: "external" };

function sortTypes(types: Iterable<EventType>): EventType[] {
  return [...new Set(types)].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
}

/** タイトルにマッチしたルールの種別をすべて返す（重複なし）。無ければ defaultEventType */
export function inferEventTypes(title: string, artist: ArtistConfig): EventType[] {
  const types = artist.eventTypeRules
    .filter((r) => new RegExp(r.pattern, "i").test(title))
    .flatMap((r) => (Array.isArray(r.type) ? r.type : [r.type]));
  return types.length ? sortTypes(types) : [artist.defaultEventType];
}

/** イベントが種別 t に該当するか（包含関係を考慮。主催対バンは「対バン」にも該当） */
export function eventHasType(e: Pick<ResolvedEvent, "types">, t: EventType): boolean {
  return e.types.some((x) => x === t || EVENT_TYPE_PARENT[x] === t);
}

/** date の日に在籍していたメンバー（途中加入・卒業・休止を考慮。member の since・until） */
export function membersOn<M extends Pick<Member, "since" | "until">>(members: M[], date: string): M[] {
  return members.filter((m) => (!m.since || m.since <= date) && (!m.until || date <= m.until));
}

/** today の時点で活動していないメンバーの、名前の横に出す言葉（until を過ぎていれば untilLabel。まだなら undefined） */
export function memberStatus(member: Pick<Member, "until" | "untilLabel">, today: string): string | undefined {
  return member.until && member.until < today ? (member.untilLabel ?? "活動終了") : undefined;
}

/** 一覧に並べる順：活動中のメンバーを元の順で先に、活動していないメンバー（memberStatus がある）を後ろに */
export function orderMembers<M extends Pick<Member, "until" | "untilLabel">>(members: M[], today: string): M[] {
  return [...members.filter((m) => !memberStatus(m, today)), ...members.filter((m) => memberStatus(m, today))];
}

/** ライブを伴うイベントか（特典会・トークだけのイベントはセトリが存在しない） */
export function isLiveEvent(e: Pick<ResolvedEvent, "types">): boolean {
  return e.types.some((t) => !NON_LIVE_TYPES.has(t));
}

/**
 * events.json（eventernote 由来の生データ）に overrides と artist.json のルールを適用し、
 * 表示・集計に使うイベント一覧を作る。日付昇順（同日は開演時刻→id 順）。
 */
export function resolveEvents(events: Event[], overrides: Overrides, artist: ArtistConfig): ResolvedEvent[] {
  const memberByEnId = new Map(artist.members.filter((m) => m.eventernoteId !== undefined).map((m) => [m.eventernoteId!, m.id]));

  const merged: Array<Event & { types?: EventType[] }> = [...events, ...overrides.extraEvents];
  const out: ResolvedEvent[] = [];

  for (const base of merged) {
    const ov = overrides.events[String(base.id)] ?? {};
    if (ov.hidden) continue;
    const { types: ovTypes, members: ovMembers, hidden: _h, note, costume, partialLineup, ...fields } = ov;
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
      // 個人名の登録が無ければ、その日に在籍していた全員が出演したものとみなす
      members = listed.length
        ? artist.members.map((m) => m.id).filter((m) => listed.includes(m))
        : membersOn(artist.members, ev.date).map((m) => m.id);
      membersSource = listed.length ? "eventernote" : "assumed";
    }

    out.push({
      ...ev,
      types: sortTypes(ovTypes ?? ev.types ?? inferEventTypes(ev.title, artist)),
      members,
      membersSource,
      note,
      costume,
      partialLineup: partialLineup ?? artist.partialLineupRules.some((r) => new RegExp(r, "i").test(ev.title)),
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? "") || a.id - b.id);
}

/** イベントが開催済みかどうか */
export type HeldCheck = (e: Pick<ResolvedEvent, "id" | "date">) => boolean;

/**
 * 開催済みとみなすイベント：前日以前、または当日でセトリが登録済みのもの。
 * 当日でもセトリが無ければまだ「開催予定」（イベント一覧の「今後のイベント」と同じ基準）
 */
export function heldCheck(today: string, setlistEventIds: Iterable<number>): HeldCheck {
  const withSetlist = new Set(setlistEventIds);
  return (e) => e.date < today || (e.date === today && withSetlist.has(e.id));
}

export type Costume = ArtistConfig["costumes"][number];

/**
 * イベントの衣装。overrides での指定があればそれ、無ければその日までに始まった通常衣装のうち最新のもの。
 * まだ開催していないイベント（held=false）・ライブでないものは分からないので undefined
 */
export function eventCostume(artist: ArtistConfig, event: ResolvedEvent, held: boolean): Costume | undefined {
  if (event.costume) return artist.costumes.find((c) => c.id === event.costume);
  if (!held || !isLiveEvent(event)) return undefined;
  return artist.costumes.filter((c) => !c.special && c.since && c.since <= event.date).sort((a, b) => b.since!.localeCompare(a.since!))[0];
}

/** 衣装ごとの着用回数と、最初・最後のイベント（着用回数の多い順） */
export function costumeStats(artist: ArtistConfig, events: ResolvedEvent[], held: HeldCheck) {
  const by = new Map<string, { costume: Costume; events: ResolvedEvent[] }>();
  for (const e of events) {
    const c = eventCostume(artist, e, held(e));
    if (!c) continue;
    const s = by.get(c.id) ?? { costume: c, events: [] };
    s.events.push(e);
    by.set(c.id, s);
  }
  return [...by.values()]
    .map((s) => ({ costume: s.costume, count: s.events.length, first: s.events[0]!, last: s.events.at(-1)! }))
    .sort((a, b) => b.count - a.count);
}
