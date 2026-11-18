import type { HeldCheck, ResolvedEvent } from "./events.ts";
import type { Song } from "./schema.ts";
import type { Stats } from "./stats.ts";

/*
 * マイルストーン（記録の節目）。
 * - 曲：通算 N 回目・N 公演連続・N 公演ぶり
 * - グループ：デビュー N 日・通算 N 公演目・通算 N 曲目
 * 「公演」は、曲の記録ではセトリのある公演（Stats.events）、通算公演数では開催済みのライブ（セトリの無いものも含む）。
 */

export type Milestone =
  | { kind: "song-count"; date: string; eventId: number; song: Song; count: number }
  | { kind: "song-streak"; date: string; eventId: number; song: Song; streak: number }
  | { kind: "song-return"; date: string; eventId: number; song: Song; gap: number }
  | { kind: "event-count"; date: string; eventId: number; count: number }
  | { kind: "total-songs"; date: string; eventId: number; count: number }
  | { kind: "debut-days"; date: string; eventId?: number; days: number; years?: number };

/** 通算回数の節目：100 回までは 10 回ごと、その先は 50 回ごと */
export const isSongCountMilestone = (n: number) => (n <= 100 ? n % 10 === 0 : n % 50 === 0);
/** 連続の節目：5 公演ごと */
export const isStreakMilestone = (n: number) => n >= 5 && n % 5 === 0;
/** 通算公演数の節目 */
export const isEventCountMilestone = (n: number) => n === 10 || n === 25 || (n >= 50 && n % 50 === 0);
/** 通算歌唱数の節目 */
export const isTotalSongsMilestone = (n: number) => n === 100 || n === 250 || (n >= 500 && n % 500 === 0);
/** これだけ間が空いて歌われたら「N 公演ぶり」 */
export const RETURN_GAP = 8;
/** 現在の連続をこれ以上から表示する */
export const STREAK_MIN = 5;

const DAY_MILESTONES = [100, 200, 300, 500, 1000];

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** デビュー日からの節目（N 日・N 周年）を until まで */
export function debutDayMilestones(since: string, until: string): Array<{ date: string; days: number; years?: number }> {
  const out: Array<{ date: string; days: number; years?: number }> = [];
  for (const days of DAY_MILESTONES) out.push({ date: addDays(since, days), days });
  for (let years = 1; years <= 30; years++) {
    const date = `${Number(since.slice(0, 4)) + years}${since.slice(4)}`;
    if (date > until) break;
    out.push({ date, days: 0, years });
  }
  return out.filter((m) => m.date <= until).sort((a, b) => a.date.localeCompare(b.date));
}

export type SongRecord = {
  song: Song;
  /** 今続いている連続公演数（最後のセトリのある公演で歌われていなければ 0） */
  currentStreak: number;
  longestStreak: number;
  /** 最長の連続が終わった（または続いている）公演 */
  longestStreakEnd?: { eventId: number; date: string };
  /** 次の通算回数の節目 */
  nextCount: number;
};

export type Milestones = {
  /** 達成済み（古い順） */
  achieved: Milestone[];
  songs: Map<string, SongRecord>;
  /** 開催済みのライブ数・通算歌唱数（今の値） */
  eventCount: number;
  totalSongs: number;
};

export function computeMilestones({
  stats,
  liveEvents,
  since,
  today,
  held: isHeld,
}: {
  stats: Stats;
  /** ライブ（特典会を除く）、日付昇順 */
  liveEvents: ResolvedEvent[];
  /** 開催済みかどうか（heldCheck） */
  held: HeldCheck;
  /** デビュー日（無ければ日数の節目は出さない） */
  since?: string;
  today: string;
}): Milestones {
  const achieved: Milestone[] = [];
  const eventIndex = new Map(stats.events.map((e, i) => [e.event.id, i]));
  const songs = new Map<string, SongRecord>();

  for (const s of stats.songs) {
    const perf = s.performances;
    // 通算回数（1 公演で複数回歌われたら、それぞれ数える）
    perf.forEach((p, i) => {
      if (isSongCountMilestone(i + 1)) achieved.push({ kind: "song-count", date: p.date, eventId: p.eventId, song: s.song, count: i + 1 });
    });
    // 公演単位：連続と「N 公演ぶり」
    const eventIds = [...new Set(perf.map((p) => p.eventId))];
    let streak = 0;
    let longest = 0;
    let longestEnd: SongRecord["longestStreakEnd"];
    let prevIdx: number | undefined;
    for (const id of eventIds) {
      const idx = eventIndex.get(id)!;
      const date = stats.events[idx]!.event.date;
      streak = prevIdx !== undefined && idx === prevIdx + 1 ? streak + 1 : 1;
      if (prevIdx !== undefined && idx - prevIdx >= RETURN_GAP) achieved.push({ kind: "song-return", date, eventId: id, song: s.song, gap: idx - prevIdx });
      if (isStreakMilestone(streak)) achieved.push({ kind: "song-streak", date, eventId: id, song: s.song, streak });
      if (streak >= longest) {
        longest = streak;
        longestEnd = { eventId: id, date };
      }
      prevIdx = idx;
    }
    const lastIdx = stats.events.length - 1;
    songs.set(s.song.id, {
      song: s.song,
      currentStreak: prevIdx === lastIdx ? streak : 0,
      longestStreak: longest,
      longestStreakEnd: longestEnd,
      nextCount: nextAfter(s.count, isSongCountMilestone),
    });
  }

  // 通算公演数（開催済みのライブ）
  const held = liveEvents.filter(isHeld);
  held.forEach((e, i) => {
    if (isEventCountMilestone(i + 1)) achieved.push({ kind: "event-count", date: e.date, eventId: e.id, count: i + 1 });
  });

  // 通算歌唱数（セトリのある公演の全歌唱）
  let total = 0;
  for (const es of stats.events) {
    const n = es.stages.reduce((m, st) => m + st.entries.length, 0);
    for (let k = total + 1; k <= total + n; k++) {
      if (isTotalSongsMilestone(k)) achieved.push({ kind: "total-songs", date: es.event.date, eventId: es.event.id, count: k });
    }
    total += n;
  }

  // デビューからの日数。その日に公演があれば結び付ける
  for (const d of since ? debutDayMilestones(since, today) : []) {
    const ev = held.find((e) => e.date === d.date);
    achieved.push({ kind: "debut-days", date: d.date, eventId: ev?.id, days: d.days, years: d.years });
  }

  const order: Record<Milestone["kind"], number> = { "debut-days": 0, "event-count": 1, "total-songs": 2, "song-count": 3, "song-streak": 4, "song-return": 5 };
  achieved.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
  return { achieved, songs, eventCount: held.length, totalSongs: total };
}

function nextAfter(n: number, isMilestone: (n: number) => boolean): number {
  let k = n + 1;
  while (!isMilestone(k)) k++;
  return k;
}

export type UpcomingMilestone =
  | { kind: "song-count"; song: Song; count: number; remaining: number; rate: number }
  | { kind: "song-streak"; song: Song; streak: number; rate: number }
  | { kind: "event-count"; count: number; event: ResolvedEvent }
  | { kind: "total-songs"; count: number; remaining: number }
  | { kind: "debut-days"; date: string; days: number; years?: number };

/**
 * これから達成しそうな節目。
 * - 曲の通算回数：あと maxRemaining 回以内（歌唱率の高い順）
 * - 連続：次も歌えば節目になる曲
 * - 通算公演数：次の公演で節目になるとき
 * - 通算歌唱数：あと 20 曲以内
 * - デビューからの日数：withinDays 日以内
 */
export function upcomingMilestones({
  milestones,
  stats,
  liveEvents,
  since,
  today,
  held,
  maxRemaining = 2,
  withinDays = 45,
}: {
  milestones: Milestones;
  stats: Stats;
  liveEvents: ResolvedEvent[];
  held: HeldCheck;
  since?: string;
  today: string;
  maxRemaining?: number;
  withinDays?: number;
}): UpcomingMilestone[] {
  const out: UpcomingMilestone[] = [];
  const rate = new Map(stats.songs.map((s) => [s.song.id, s.rate]));

  const songItems: UpcomingMilestone[] = [];
  for (const s of stats.songs) {
    if (s.count === 0 || s.song.cover) continue;
    const rec = milestones.songs.get(s.song.id)!;
    const remaining = rec.nextCount - s.count;
    if (remaining <= maxRemaining) songItems.push({ kind: "song-count", song: s.song, count: rec.nextCount, remaining, rate: s.rate });
    if (rec.currentStreak > 0 && isStreakMilestone(rec.currentStreak + 1)) {
      songItems.push({ kind: "song-streak", song: s.song, streak: rec.currentStreak + 1, rate: rate.get(s.song.id) ?? 0 });
    }
  }
  songItems.sort((a, b) => {
    const ra = a.kind === "song-count" ? a.remaining : 1;
    const rb = b.kind === "song-count" ? b.remaining : 1;
    return ra - rb || ("rate" in b ? b.rate : 0) - ("rate" in a ? a.rate : 0);
  });

  const next = liveEvents.find((e) => !held(e));
  if (next && isEventCountMilestone(milestones.eventCount + 1)) out.push({ kind: "event-count", count: milestones.eventCount + 1, event: next });

  const nextTotal = nextAfter(milestones.totalSongs, isTotalSongsMilestone);
  if (nextTotal - milestones.totalSongs <= 20) out.push({ kind: "total-songs", count: nextTotal, remaining: nextTotal - milestones.totalSongs });

  const limit = addDays(today, withinDays);
  for (const d of since ? debutDayMilestones(since, limit) : []) if (d.date > today) out.push({ kind: "debut-days", ...d });

  return [...out, ...songItems];
}
