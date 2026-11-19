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
/** キャッシュに残すポストの期間 */
export const KEEP_HOURS = 36;

export const startOf = (e: ResolvedEvent) => new Date(`${e.date}T${e.start ?? DEFAULT_START}:00+09:00`);

/**
 * セトリ告知を待っているイベント（ライブで、開演済み・開演から WATCH_HOURS 以内・セトリが確定していない）。
 * 自動で取り込んだだけのセトリは、続きのポストで更新するかもしれないので「確定」に含めない。
 */
export function pendingEvents(events: ResolvedEvent[], settled: (id: number) => boolean, now: Date): ResolvedEvent[] {
  return events.filter((e) => {
    if (!isLiveEvent(e) || settled(e.id)) return false;
    const start = startOf(e).getTime();
    return start <= now.getTime() && now.getTime() <= start + WATCH_HOURS * 3_600_000;
  });
}

/** 告知の識別子。続きのポストが付くと最後のポストの id が変わるので、もう一度処理される */
export const postKey = (p: SetlistPost) => `${p.part ? `${p.id}#${p.part}` : p.id}@${p.tweets.at(-1)!.id}`;
/** postKey の先頭のポストの id */
export const keyPostId = (key: string) => key.split(/[#@]/)[0]!;

export type Decision =
  /** update: 前に自動で取り込んだセトリを、続きのポストを合わせたもので置き換える */
  | { kind: "import"; key: string; post: SetlistPost; event: ResolvedEvent; setlist: Setlist; warnings: string[]; update: boolean }
  /** 告知は見つかったが取り込めない（曲名が songs.json に無い） */
  | { kind: "unknown-songs"; key: string; post: SetlistPost; event: ResolvedEvent; unknown: string[] }
  /** 告知は見つかったがイベントを 1 つに絞れない（候補のうちセトリ待ちのもの） */
  | { kind: "ambiguous"; key: string; post: SetlistPost; candidates: ResolvedEvent[] }
  /** 処理済みにするだけ（既にセトリがある・対象外） */
  | { kind: "ignore"; key: string; reason: string };

/**
 * 集めたポストから、何を取り込むかを決める。
 * - 「セトリ」等の見出しがある告知だけを対象にする（リリース告知の収録曲一覧などを拾わない）
 * - 見つけたらすぐに取り込む。スレッドの続きが後から来たら、合わせたもので取り込み直す
 * - 既にセトリがあるイベントは上書きしない（手動で入れたもの・修正したものを優先）。
 *   例外は ownImport（自動で取り込んだまま、誰も手を加えていないもの）
 * - songs に無い曲があれば取り込まずに知らせる（新曲かどうかは人が判断する）
 */
export function decide(opts: {
  tweets: CollectedTweet[];
  events: ResolvedEvent[];
  songs: Song[];
  artistName: string;
  hasSetlist: (id: number) => boolean;
  /** 自動で取り込んだまま変更されていないセトリか */
  ownImport: (id: number) => boolean;
  handled: Set<string>;
}): Decision[] {
  const { songs } = opts;
  const posts = extractPosts(opts.tweets, { isKnownSong: (item) => findSong(songs, item) !== undefined }).filter((p) =>
    looksLikeSetlistAnnouncement(p.tweets[0]!.text),
  );

  const out: Decision[] = [];
  // 処理済みの告知も照合には含める（同じイベントに後の告知が割り当てられないように）
  for (const r of matchPosts(posts, opts.events, {}, [opts.artistName])) {
    const key = postKey(r.post);
    if (opts.handled.has(key)) continue;
    if (r.kind === "unmatched") {
      out.push({ kind: "ignore", key, reason: "イベントが見つからない" });
    } else if (r.kind === "ambiguous") {
      const candidates = r.candidates.filter((e) => !opts.hasSetlist(e.id));
      out.push(
        candidates.length
          ? { kind: "ambiguous", key, post: r.post, candidates }
          : { kind: "ignore", key, reason: "候補はすべてセトリ登録済み" },
      );
    } else if (opts.hasSetlist(r.event.id) && !opts.ownImport(r.event.id)) {
      out.push({ kind: "ignore", key, reason: `${r.event.id} はセトリ登録済み` });
    } else {
      // addUnknown は使わないので songs は変更されない
      const built = buildSetlist(r.post.stages, songs, { eventId: r.event.id, source: r.post.url, addUnknown: false });
      out.push(
        built.setlist
          ? {
              kind: "import",
              key,
              post: r.post,
              event: r.event,
              setlist: built.setlist,
              warnings: built.warnings,
              update: opts.hasSetlist(r.event.id),
            }
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
