import { isLiveEvent, type HeldCheck, type ResolvedEvent } from "./events.ts";
import type { ArtistConfig, Member } from "./schema.ts";
import type { Stats } from "./stats.ts";

export type MemberStats = {
  member: Member;
  /** 出演したイベント数 */
  appearances: number;
  /** 集計対象のイベント数（開催済みのライブ） */
  total: number;
  /** appearances / total */
  rate: number;
  /** 欠席したイベント（日付昇順） */
  absences: ResolvedEvent[];
  /** 参加した歌唱の数（セトリ登録済みのイベントのみ） */
  performances: number;
};

export type MemberStatsInput = {
  artist: ArtistConfig;
  /** resolveEvents の結果（日付昇順） */
  events: ResolvedEvent[];
  /** computeStats の結果（歌唱数の集計に使う） */
  stats: Stats;
  /** 開催済みのイベントだけを対象にする（heldCheck） */
  held: HeldCheck;
};

/**
 * メンバーごとの出演・欠席・歌唱数。
 * 出演メンバーの情報が無いイベント（membersSource: "assumed"）は全員出演として数える。
 */
export function computeMemberStats({ artist, events, stats, held: isHeld }: MemberStatsInput): MemberStats[] {
  const held = events.filter((e) => isLiveEvent(e) && isHeld(e));

  const performances = new Map<string, number>();
  for (const es of stats.events) {
    if (!isHeld(es.event)) continue;
    for (const stage of es.stages) {
      for (const entry of stage.entries) {
        for (const m of entry.members) performances.set(m, (performances.get(m) ?? 0) + 1);
      }
    }
  }

  return artist.members.map((member) => {
    // 在籍していた期間（加入〜卒業・休止）のイベントだけを数える。加入前のイベントは「欠席」ではない。
    // 出演するメンバーが初めから一部だけのイベント（生誕など）は、出演した人だけ数える（出なかった人は欠席ではない）
    const during = held.filter(
      (e) =>
        (!member.since || member.since <= e.date) &&
        (!member.until || e.date <= member.until) &&
        (!e.partialLineup || e.members.includes(member.id)),
    );
    const absences = during.filter((e) => !e.members.includes(member.id));
    const appearances = during.length - absences.length;
    return {
      member,
      appearances,
      total: during.length,
      rate: during.length ? appearances / during.length : 0,
      absences,
      performances: performances.get(member.id) ?? 0,
    };
  });
}
