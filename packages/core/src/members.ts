import { isLiveEvent, type ResolvedEvent } from "./events.ts";
import type { ArtistConfig, Member } from "./schema.ts";
import type { Stats } from "./stats.ts";

export type MemberStats = {
  member: Member;
  /** 出演した公演数 */
  appearances: number;
  /** 集計対象の公演数（開催済みのライブ） */
  total: number;
  /** appearances / total */
  rate: number;
  /** 欠席した公演（日付昇順） */
  absences: ResolvedEvent[];
  /** 参加した歌唱の数（セトリ登録済みの公演のみ） */
  performances: number;
};

export type MemberStatsInput = {
  artist: ArtistConfig;
  /** resolveEvents の結果（日付昇順） */
  events: ResolvedEvent[];
  /** computeStats の結果（歌唱数の集計に使う） */
  stats: Stats;
  /** この日までに開催された公演を対象にする（YYYY-MM-DD、当日を含む） */
  until: string;
};

/**
 * メンバーごとの出演・欠席・歌唱数。
 * 出演メンバーの情報が無い公演（membersSource: "assumed"）は全員出演として数える。
 */
export function computeMemberStats({ artist, events, stats, until }: MemberStatsInput): MemberStats[] {
  const held = events.filter((e) => isLiveEvent(e) && e.date <= until);

  const performances = new Map<string, number>();
  for (const es of stats.events) {
    if (es.event.date > until) continue;
    for (const stage of es.stages) {
      for (const entry of stage.entries) {
        for (const m of entry.members) performances.set(m, (performances.get(m) ?? 0) + 1);
      }
    }
  }

  return artist.members.map((member) => {
    const absences = held.filter((e) => !e.members.includes(member.id));
    const appearances = held.length - absences.length;
    return {
      member,
      appearances,
      total: held.length,
      rate: held.length ? appearances / held.length : 0,
      absences,
      performances: performances.get(member.id) ?? 0,
    };
  });
}
