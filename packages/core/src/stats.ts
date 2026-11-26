import { isLiveEvent, membersOn, type ResolvedEvent } from "./events.ts";
import type { ArtistConfig, Setlist, Song } from "./schema.ts";
import { isDance, itemSong, setlistStages, UNKNOWN_SONG } from "./setlist.ts";
import { findSong } from "./setlist-text.ts";

/** 1 回の歌唱 */
export type Performance = {
  eventId: number;
  date: string;
  stageIndex: number;
  stageName?: string;
  /** ステージ内の曲順（1 始まり） */
  position: number;
  /** 表示用の番号（M3 / EN / EN1 …） */
  no: string;
  encore: boolean;
  note?: string;
  members: string[];
  /** 記録上の初披露（この曲が最初に現れた歌唱） */
  debut: boolean;
  /** コラボでの歌唱（コラボステージ、またはセトリの途中のコラボの曲） */
  collab: boolean;
  with?: string[];
};

export type SetlistEntry = {
  song: Song;
  position: number;
  /** 表示用の番号（M3 / EN / EN1 …） */
  no: string;
  encore: boolean;
  note?: string;
  members: string[];
  debut: boolean;
  with?: string[];
  /** 他グループとのコラボ（コラボステージ、またはセトリの途中のコラボの曲） */
  collab: boolean;
};

export type EventSetlist = {
  event: ResolvedEvent;
  source?: string;
  note?: string;
  /** 記録の揃い具合（Setlist の completeness） */
  completeness?: "partial" | "unordered";
  /** 曲名を思い出せない曲（"?"）の数 */
  unknownSongs: number;
  stages: Array<{ name?: string; note?: string; collab: boolean; members: string[]; entries: SetlistEntry[] }>;
};

export type SongStats = {
  song: Song;
  /** 歌唱回数（同一イベントの別ステージでの重複も数える） */
  count: number;
  /** 歌唱ステージ数 */
  stages: number;
  /** 歌唱イベント数（歌唱率の分子。eligibleEvents に入るイベントのうち歌われたもの） */
  events: number;
  /**
   * 初披露以降の集計対象イベント数（初披露のイベントを含む）。未披露なら 0。
   * 出演が初めから一部のメンバーだけのイベント（生誕・公開録音など。partialLineup）は、その曲を歌う人が揃っていたときだけ入れる
   * （生誕イベントで全員の曲が歌われないのは当たり前なので、分母に入れると歌唱率が下がってしまう。歌唱回数にはいつも数える）
   */
  eligibleEvents: number;
  /**
   * 歌唱率 = events / eligibleEvents。
   * 分母を初披露以降に限ることで、後から披露された曲が不利にならないようにする
   */
  rate: number;
  first?: { eventId: number; date: string };
  last?: { eventId: number; date: string };
  /** 最後に歌われた後、セトリのあるイベントがいくつ続いたか（未披露なら null） */
  sinceLast: number | null;
  /** 年ごとの歌唱回数 */
  byYear: Record<string, number>;
  performances: Performance[];
};

export type Stats = {
  /** 集計対象（セトリ入力済みのライブ）イベント、日付昇順 */
  events: EventSetlist[];
  /**
   * ライブの無いイベント（トークなど）で歌われた曲の記録（誕生日の歌など）。ページに表示するだけで、歌唱回数・初披露・曲順などには数えない
   */
  offRecord: EventSetlist[];
  totalStages: number;
  totalPerformances: number;
  /** songs.json の全曲（未披露曲を含む） */
  songs: SongStats[];
  /** songs.json と照合できなかった曲名（validate で検出されるはずのもの） */
  unresolved: Array<{ eventId: number; title: string }>;
};

export type StatsInput = {
  songs: Song[];
  /** resolveEvents の結果（日付昇順） */
  events: ResolvedEvent[];
  setlists: Setlist[];
  /** 集計対象を絞り込む（イベント種別など） */
  filter?: (e: ResolvedEvent) => boolean;
  /** コラボステージを含めるか（既定 true）。false ならそのステージは無いものとして扱う */
  includeCollab?: boolean;
  /**
   * メンバーとユニット。出演が一部のメンバーだけのイベントを、その曲の歌唱率に数えるかの判断に使う。
   * 無ければ、そういうイベントは歌唱率に数えない
   */
  artist?: Pick<ArtistConfig, "members" | "units">;
};

export function computeStats({ songs, events, setlists, filter, includeCollab = true, artist }: StatsInput): Stats {
  const setlistByEvent = new Map(setlists.map((s) => [s.event, s]));
  const unresolved: Stats["unresolved"] = [];
  const debuted = new Set<string>();
  const perfBySong = new Map<string, Performance[]>(songs.map((s) => [s.id, []]));

  const withSetlist = events.filter((e) => setlistByEvent.has(e.id) && (!filter || filter(e)));
  // 数えるのはライブだけ。トークなどで歌われた曲は記録として別に持つ
  const targets = withSetlist.filter(isLiveEvent);
  const counted = new Set(targets.map((e) => e.id));
  const allSetlists: EventSetlist[] = withSetlist.map((event) => {
    const count = counted.has(event.id);
    const setlist = setlistByEvent.get(event.id)!;
    // stageIndex は除外後の並びでの位置（EventSetlist.stages の添字と一致させる）
    const kept = setlistStages(setlist).filter((st) => includeCollab || !st.collab);
    let unknownSongs = 0;
    const stages = kept.map((stage, stageIndex) => {
      const collab = stage.collab ?? false;
      const stageMembers = stage.members ?? event.members;
      const entries: SetlistEntry[] = [];
      const encores = stage.items.filter((item) => typeof item !== "string" && item.encore).length;
      let encoreNo = 0;
      stage.items.forEach((item, i) => {
        const obj = typeof item === "string" ? undefined : item;
        const encore = obj?.encore ?? false;
        // アンコールが 1 曲だけなら EN、複数なら EN1・EN2…
        const no = encore ? (encores > 1 ? `EN${++encoreNo}` : "EN") : `M${i + 1}`;
        const title = itemSong(item);
        // セトリの途中のコラボの曲は、コラボを含めないときは数えない（曲順の位置は占める）
        if (obj?.collab && !includeCollab) return;
        // 曲名を思い出せない曲は、曲順の位置だけ占めて数えない
        if (title === UNKNOWN_SONG) {
          unknownSongs++;
          return;
        }
        const song = findSong(songs, { label: title, title });
        if (!song) {
          unresolved.push({ eventId: event.id, title });
          return;
        }
        const debut = count && !debuted.has(song.id);
        if (count) debuted.add(song.id);
        const entry: SetlistEntry = {
          song,
          position: i + 1,
          no,
          encore,
          note: obj?.note,
          members: obj?.members ?? stageMembers,
          debut,
          with: obj?.with,
          collab: collab || !!obj?.collab,
        };
        entries.push(entry);
        if (count)
          perfBySong.get(song.id)!.push({
            eventId: event.id,
            date: event.date,
            stageIndex,
            stageName: stage.name,
            position: entry.position,
            no,
            encore: entry.encore,
            note: entry.note,
            members: entry.members,
            debut,
            collab: entry.collab,
            with: entry.with,
          });
      });
      return { name: stage.name, note: stage.note, collab, members: stageMembers, entries };
    });
    return { event, source: setlist.source, note: setlist.note, completeness: setlist.completeness, unknownSongs, stages };
  });

  const eventSetlists = allSetlists.filter((e) => counted.has(e.event.id));
  const eventIndex = new Map(targets.map((e, i) => [e.id, i]));
  const total = targets.length;
  // 出演が初めから一部のメンバーだけのイベント（生誕・公開録音など）は、その曲を歌う人（ユニットのメンバー。
  // ユニットが無ければその日の全員）が揃っていたときだけ、その曲の歌唱率に数える
  const unitMembers = new Map((artist?.units ?? []).flatMap((u) => (u.members ? [[u.id, u.members] as const] : [])));
  const countsFor = (song: Song, e: ResolvedEvent) => {
    if (!e.partialLineup) return true;
    if (!artist) return false;
    const need = (song.unit ? unitMembers.get(song.unit) : undefined) ?? membersOn(artist.members, e.date).map((m) => m.id);
    return need.every((m) => e.members.includes(m));
  };

  const songStats: SongStats[] = songs.map((song) => {
    const performances = perfBySong.get(song.id)!;
    const stageKeys = new Set(performances.map((p) => `${p.eventId}:${p.stageIndex}`));
    const eventIds = new Set(performances.map((p) => p.eventId));
    const byYear: Record<string, number> = {};
    for (const p of performances) byYear[p.date.slice(0, 4)] = (byYear[p.date.slice(0, 4)] ?? 0) + 1;
    const first = performances[0];
    const last = performances.at(-1);
    const eligible = first ? targets.slice(eventIndex.get(first.eventId)).filter((e) => countsFor(song, e)) : [];
    const eligibleEvents = eligible.length;
    const rateEvents = eligible.filter((e) => eventIds.has(e.id)).length;
    return {
      song,
      count: performances.length,
      stages: stageKeys.size,
      events: rateEvents,
      eligibleEvents,
      rate: eligibleEvents ? rateEvents / eligibleEvents : 0,
      first: first && { eventId: first.eventId, date: first.date },
      last: last && { eventId: last.eventId, date: last.date },
      sinceLast: last ? total - 1 - eventIndex.get(last.eventId)! : null,
      byYear,
      performances,
    };
  });

  return {
    events: eventSetlists,
    offRecord: allSetlists.filter((e) => !counted.has(e.event.id)),
    totalStages: eventSetlists.reduce((n, e) => n + e.stages.length, 0),
    // 総歌唱数にダンスなど歌ではないものは入れない
    totalPerformances: eventSetlists.reduce(
      (n, e) => n + e.stages.reduce((m, s) => m + s.entries.filter((x) => !isDance(x.song)).length, 0),
      0,
    ),
    songs: songStats,
    unresolved,
  };
}
