import type { ResolvedEvent } from "./events.ts";
import { itemSong, setlistStages, type Setlist, type Song } from "./schema.ts";
import { findSong } from "./setlist-text.ts";

/** 1 回の歌唱 */
export type Performance = {
  eventId: number;
  date: string;
  stageIndex: number;
  stageName?: string;
  /** ステージ内の曲順（1 始まり） */
  position: number;
  encore: boolean;
  note?: string;
  members: string[];
  /** 記録上の初披露（この曲が最初に現れた歌唱） */
  debut: boolean;
};

export type SetlistEntry = {
  song: Song;
  position: number;
  encore: boolean;
  note?: string;
  members: string[];
  debut: boolean;
};

export type EventSetlist = {
  event: ResolvedEvent;
  source?: string;
  note?: string;
  stages: Array<{ name?: string; note?: string; members: string[]; entries: SetlistEntry[] }>;
};

export type SongStats = {
  song: Song;
  /** 歌唱回数（同一イベントの別ステージでの重複も数える） */
  count: number;
  /** 歌唱ステージ数 */
  stages: number;
  /** 歌唱イベント数 */
  events: number;
  /** 初披露以降の集計対象イベント数（初披露の公演を含む）。未披露なら 0 */
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
  /** 集計対象（セトリ入力済み）イベント、日付昇順 */
  events: EventSetlist[];
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
};

export function computeStats({ songs, events, setlists, filter }: StatsInput): Stats {
  const setlistByEvent = new Map(setlists.map((s) => [s.event, s]));
  const unresolved: Stats["unresolved"] = [];
  const debuted = new Set<string>();
  const perfBySong = new Map<string, Performance[]>(songs.map((s) => [s.id, []]));

  const targets = events.filter((e) => setlistByEvent.has(e.id) && (!filter || filter(e)));
  const eventSetlists: EventSetlist[] = targets.map((event) => {
    const setlist = setlistByEvent.get(event.id)!;
    const stages = setlistStages(setlist).map((stage, stageIndex) => {
      const stageMembers = stage.members ?? event.members;
      const entries: SetlistEntry[] = [];
      stage.items.forEach((item, i) => {
        const title = itemSong(item);
        const song = findSong(songs, { label: title, title });
        if (!song) {
          unresolved.push({ eventId: event.id, title });
          return;
        }
        const obj = typeof item === "string" ? undefined : item;
        const debut = !debuted.has(song.id);
        debuted.add(song.id);
        const entry: SetlistEntry = {
          song,
          position: i + 1,
          encore: obj?.encore ?? false,
          note: obj?.note,
          members: obj?.members ?? stageMembers,
          debut,
        };
        entries.push(entry);
        perfBySong.get(song.id)!.push({
          eventId: event.id,
          date: event.date,
          stageIndex,
          stageName: stage.name,
          position: entry.position,
          encore: entry.encore,
          note: entry.note,
          members: entry.members,
          debut,
        });
      });
      return { name: stage.name, note: stage.note, members: stageMembers, entries };
    });
    return { event, source: setlist.source, note: setlist.note, stages };
  });

  const eventIndex = new Map(targets.map((e, i) => [e.id, i]));
  const total = targets.length;

  const songStats: SongStats[] = songs.map((song) => {
    const performances = perfBySong.get(song.id)!;
    const stageKeys = new Set(performances.map((p) => `${p.eventId}:${p.stageIndex}`));
    const eventIds = new Set(performances.map((p) => p.eventId));
    const byYear: Record<string, number> = {};
    for (const p of performances) byYear[p.date.slice(0, 4)] = (byYear[p.date.slice(0, 4)] ?? 0) + 1;
    const first = performances[0];
    const last = performances.at(-1);
    const eligibleEvents = first ? total - eventIndex.get(first.eventId)! : 0;
    return {
      song,
      count: performances.length,
      stages: stageKeys.size,
      events: eventIds.size,
      eligibleEvents,
      rate: eligibleEvents ? eventIds.size / eligibleEvents : 0,
      first: first && { eventId: first.eventId, date: first.date },
      last: last && { eventId: last.eventId, date: last.date },
      sinceLast: last ? total - 1 - eventIndex.get(last.eventId)! : null,
      byYear,
      performances,
    };
  });

  return {
    events: eventSetlists,
    totalStages: eventSetlists.reduce((n, e) => n + e.stages.length, 0),
    totalPerformances: eventSetlists.reduce((n, e) => n + e.stages.reduce((m, s) => m + s.entries.length, 0), 0),
    songs: songStats,
    unresolved,
  };
}
