/**
 * 公式 X のポストからセトリを自動で取り込むときの判断（API やファイルに触れない部分）。
 */
import { findSong, isLiveEvent, looksLikeSetlistAnnouncement, type ResolvedEvent, type Setlist, type Song } from "@lovely-memory/core";
import { buildSetlist } from "./setlist-build.ts";
import { extractPosts, matchPosts, toJst, type CollectedTweet, type SetlistPost } from "./tweet-match.ts";

/** 開演からこの時間までを「セトリ告知を待つ」時間とする */
export const WATCH_HOURS = 8;
/** 開演時刻が無いイベントはこの時刻に始まったとみなす */
const DEFAULT_START = "10:00";
/** 最後のポストからこの分数が経つまで取り込まない（スレッドの続きを待つ。tweet-match の結合条件と同じ 20 分） */
export const SETTLE_MINUTES = 20;
/** キャッシュに残すポストの期間 */
export const KEEP_HOURS = 36;

export const startOf = (e: ResolvedEvent) => new Date(`${e.date}T${e.start ?? DEFAULT_START}:00+09:00`);

/** セトリ告知を待っているイベント（ライブで、開演済み・開演から WATCH_HOURS 以内・セトリ未登録） */
export function pendingEvents(events: ResolvedEvent[], hasSetlist: (id: number) => boolean, now: Date): ResolvedEvent[] {
  return events.filter((e) => {
    if (!isLiveEvent(e) || hasSetlist(e.id)) return false;
    const start = startOf(e).getTime();
    return start <= now.getTime() && now.getTime() <= start + WATCH_HOURS * 3_600_000;
  });
}

export const postKey = (p: SetlistPost) => (p.part ? `${p.id}#${p.part}` : p.id);

export type Decision =
  | { kind: "import"; key: string; post: SetlistPost; event: ResolvedEvent; setlist: Setlist; warnings: string[] }
  /** 告知は見つかったが取り込めない（曲名が songs.json に無い） */
  | { kind: "unknown-songs"; key: string; post: SetlistPost; event: ResolvedEvent; unknown: string[] }
  /** 告知は見つかったがイベントを 1 つに絞れない（候補のうちセトリ待ちのもの） */
  | { kind: "ambiguous"; key: string; post: SetlistPost; candidates: ResolvedEvent[] }
  /** 処理済みにするだけ（既にセトリがある・対象外） */
  | { kind: "ignore"; key: string; reason: string };

/**
 * 集めたポストから、何を取り込むかを決める。
 * - 「セトリ」等の見出しがある告知だけを対象にする（リリース告知の収録曲一覧などを拾わない）
 * - 既にセトリがあるイベントは上書きしない（手動で入れたもの・修正したものを優先）
 * - songs に無い曲があれば取り込まずに知らせる（新曲かどうかは人が判断する）
 * - 最後のポストから SETTLE_MINUTES 経っていない告知は次回に回す（handled にも入れない）
 */
export function decide(opts: {
  tweets: CollectedTweet[];
  events: ResolvedEvent[];
  songs: Song[];
  artistName: string;
  hasSetlist: (id: number) => boolean;
  handled: Set<string>;
  now: Date;
}): Decision[] {
  const { songs, now } = opts;
  const posts = extractPosts(opts.tweets, { isKnownSong: (item) => findSong(songs, item) !== undefined }).filter((p) =>
    looksLikeSetlistAnnouncement(p.tweets[0]!.text),
  );
  const settled = (p: SetlistPost) => now.getTime() - new Date(p.tweets.at(-1)!.time).getTime() >= SETTLE_MINUTES * 60_000;

  const out: Decision[] = [];
  // 処理済みの告知も照合には含める（同じイベントに後の告知が割り当てられないように）
  for (const r of matchPosts(posts, opts.events, {}, [opts.artistName])) {
    const key = postKey(r.post);
    if (opts.handled.has(key) || !settled(r.post)) continue;
    if (r.kind === "unmatched") {
      out.push({ kind: "ignore", key, reason: "イベントが見つからない" });
    } else if (r.kind === "ambiguous") {
      const candidates = r.candidates.filter((e) => !opts.hasSetlist(e.id));
      out.push(
        candidates.length
          ? { kind: "ambiguous", key, post: r.post, candidates }
          : { kind: "ignore", key, reason: "候補はすべてセトリ登録済み" },
      );
    } else if (opts.hasSetlist(r.event.id)) {
      out.push({ kind: "ignore", key, reason: `${r.event.id} はセトリ登録済み` });
    } else {
      // addUnknown は使わないので songs は変更されない
      const built = buildSetlist(r.post.stages, songs, { eventId: r.event.id, source: r.post.url, addUnknown: false });
      out.push(
        built.setlist
          ? { kind: "import", key, post: r.post, event: r.event, setlist: built.setlist, warnings: built.warnings }
          : { kind: "unknown-songs", key, post: r.post, event: r.event, unknown: built.unknown },
      );
    }
  }
  return out;
}

/** 古いポストをキャッシュから落とす */
export function prune(tweets: CollectedTweet[], now: Date): CollectedTweet[] {
  const limit = now.getTime() - KEEP_HOURS * 3_600_000;
  return tweets.filter((t) => new Date(t.time).getTime() >= limit);
}

export const jstLabel = (iso: string) => toJst(iso).replace("T", " ");
