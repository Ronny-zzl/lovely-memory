import { isDance } from "./setlist.ts";
import type { Song } from "./schema.ts";
import type { EventSetlist } from "./stats.ts";

/*
 * セトリの曲順から読み取れる傾向。
 * - コラボステージ（他グループの企画）と、記録が揃っていないセトリ（completeness・思い出せない曲）は対象外
 * - 「本編」はアンコール以外の曲。1 曲目・ラスト・前半/中盤/後半は本編の中での位置で判定する
 * - つながり（A → B）・決まった流れは、同じステージの本編どうし・アンコールどうしで連続した曲。
 *   本編ラスト → アンコール 1 曲目は数えない
 */

export type Zone = "early" | "middle" | "late";

export type SongPosition = {
  song: Song;
  /** 本編での歌唱回数（位置の分母） */
  count: number;
  opener: number;
  closer: number;
  /** 本編の前 1/3・中 1/3・後 1/3 に入った回数（本編が 1 曲だけのステージは数えない） */
  zones: Record<Zone, number>;
  encore: number;
};

export type Transition = {
  from: Song;
  to: Song;
  count: number;
  /** from に次の曲があった回数（本編ラスト・アンコールの最後でなかった回数） */
  fromCount: number;
};

export type Chain = {
  songs: Song[];
  count: number;
};

export type Patterns = {
  /** 本編のステージ数 */
  stages: number;
  positions: SongPosition[];
  /** 回数の多い順 */
  transitions: Transition[];
  /** 3 曲以上の決まった流れ。回数の多い順、同数なら長い順 */
  chains: Chain[];
};

type Stage = Song[];

/**
 * コラボ以外のステージを、本編とアンコールに分けた曲の並び。
 * 記録が揃っていないセトリ（一部だけ・曲順不明・思い出せない曲がある）は、位置もつながりも正しくないので使わない
 */
function blocks(events: EventSetlist[], encore: boolean, splitAtDance = false): Stage[] {
  return events
    .filter((e) => !e.completeness && e.unknownSongs === 0)
    .flatMap((e) =>
      e.stages
        .filter((s) => !s.collab)
        .flatMap((s) => {
          const songs = s.entries.filter((x) => x.encore === encore).map((x) => x.song);
          // ダンスなど歌ではないものは数えない。つながりを数えるときは、その前後を別の並びにする（前後の曲は続いていない）
          if (!splitAtDance) return [songs.filter((x) => !isDance(x))];
          const runs: Song[][] = [[]];
          for (const x of songs)
            if (isDance(x)) runs.push([]);
            else runs.at(-1)!.push(x);
          return runs;
        }),
    )
    .filter((s) => s.length > 0);
}

export function zoneOf(index: number, length: number): Zone | undefined {
  if (length < 2) return undefined;
  const r = index / (length - 1);
  return r < 1 / 3 ? "early" : r > 2 / 3 ? "late" : "middle";
}

export function computePatterns(events: EventSetlist[], options: { minChainCount?: number; minChainLength?: number } = {}): Patterns {
  const { minChainCount = 3, minChainLength = 3 } = options;
  const stages = blocks(events, false);
  // つながり・流れは本編とアンコールのそれぞれの中で数える
  const runs = [...blocks(events, false, true), ...blocks(events, true, true)];

  const positions = new Map<string, SongPosition>();
  const pos = (song: Song) => {
    let p = positions.get(song.id);
    if (!p) positions.set(song.id, (p = { song, count: 0, opener: 0, closer: 0, zones: { early: 0, middle: 0, late: 0 }, encore: 0 }));
    return p;
  };
  for (const stage of stages) {
    stage.forEach((song, i) => {
      const p = pos(song);
      p.count++;
      if (i === 0) p.opener++;
      if (i === stage.length - 1) p.closer++;
      const z = zoneOf(i, stage.length);
      if (z) p.zones[z]++;
    });
  }
  for (const e of events)
    for (const s of e.stages) if (!s.collab) for (const x of s.entries) if (x.encore && !isDance(x.song)) pos(x.song).encore++;

  const pairs = new Map<string, Transition>();
  const hasNext = new Map<string, number>();
  for (const stage of runs) {
    for (let i = 0; i + 1 < stage.length; i++) {
      const from = stage[i]!;
      const to = stage[i + 1]!;
      hasNext.set(from.id, (hasNext.get(from.id) ?? 0) + 1);
      const key = `${from.id}>${to.id}`;
      const t = pairs.get(key) ?? { from, to, count: 0, fromCount: 0 };
      t.count++;
      pairs.set(key, t);
    }
  }
  const transitions = [...pairs.values()]
    .map((t) => ({ ...t, fromCount: hasNext.get(t.from.id)! }))
    .sort((a, b) => b.count - a.count || b.count / b.fromCount - a.count / a.fromCount);

  return {
    stages: stages.length,
    positions: [...positions.values()],
    transitions,
    chains: findChains(runs, minChainCount, minChainLength),
  };
}

/**
 * minCount 回以上現れる、minLength 曲以上の連続した流れ。
 * 同じ回数のより長い流れに含まれるもの（その一部分にすぎないもの）は省く。
 */
function findChains(stages: Stage[], minCount: number, minLength: number): Chain[] {
  const counts = new Map<string, { songs: Song[]; count: number }>();
  for (const stage of stages) {
    // 同じステージ内で同じ流れが 2 回出ても 1 回と数える
    const seen = new Set<string>();
    for (let len = minLength; len <= stage.length; len++) {
      for (let i = 0; i + len <= stage.length; i++) {
        const songs = stage.slice(i, i + len);
        const key = songs.map((s) => s.id).join(">");
        if (seen.has(key)) continue;
        seen.add(key);
        const c = counts.get(key) ?? { songs, count: 0 };
        c.count++;
        counts.set(key, c);
      }
    }
  }
  const frequent = [...counts].filter(([, c]) => c.count >= minCount);
  const maximal = frequent.filter(
    ([key, c]) => !frequent.some(([other, o]) => other !== key && o.count === c.count && `>${other}>`.includes(`>${key}>`)),
  );
  return maximal.map(([, c]) => c).sort((a, b) => b.count - a.count || b.songs.length - a.songs.length);
}

/** 曲の前後に来た曲（本編のつながり）。回数の多い順 */
export function neighbors(patterns: Patterns, songId: string): { before: Transition[]; after: Transition[] } {
  return {
    before: patterns.transitions.filter((t) => t.to.id === songId),
    after: patterns.transitions.filter((t) => t.from.id === songId),
  };
}

/**
 * 決まった位置で歌われる曲か（例: ラスト定番）。
 * 本編で minCount 回以上歌われ、そのうち share 以上が 1 曲目／ラストのとき
 */
export function positionRole(p: SongPosition, { minCount = 5, share = 0.8 } = {}): "opener" | "closer" | undefined {
  if (p.count < minCount) return undefined;
  if (p.closer / p.count >= share) return "closer";
  if (p.opener / p.count >= share) return "opener";
  return undefined;
}
