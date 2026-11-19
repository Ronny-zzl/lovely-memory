/**
 * X API v2 の最小クライアント（ユーザーのポスト一覧だけ）。
 * 従量課金なので、読むポストの数をできるだけ少なくする（since_id で前回より新しいものだけ）。
 * トークンはログやエラーメッセージに出さない。
 */
import type { CollectedTweet } from "./tweet-match.ts";

type ApiPost = { id: string; text: string; created_at: string; note_tweet?: { text: string } };
type ApiResponse = { data?: ApiPost[]; meta?: { next_token?: string; result_count?: number }; errors?: unknown[] };

/** 1 回の実行で読む最大ページ数（1 ページ最大 100 件）。想定外に多く読んで課金されるのを防ぐ */
const MAX_PAGES = 3;

/** API の本文は & < > がエスケープされている。末尾などの t.co リンク（画像・動画）は曲名の邪魔になるので消す */
export function postText(p: ApiPost): string {
  return (p.note_tweet?.text ?? p.text)
    .replace(/https:\/\/t\.co\/\w+/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+$/gm, "");
}

export function toCollected(p: ApiPost, username: string): CollectedTweet {
  return { id: p.id, url: `https://x.com/${username}/status/${p.id}`, time: p.created_at, text: postText(p), author: username };
}

/**
 * ユーザーのポストを新しい順に取得する（リポストは除く。スレッドの続きは自分への返信なので含める）。
 * sinceId か startTime のどちらかで範囲を限る。
 */
export async function fetchUserPosts(opts: {
  token: string;
  userId: string;
  username: string;
  sinceId?: string;
  startTime?: string;
}): Promise<CollectedTweet[]> {
  const out: CollectedTweet[] = [];
  let next: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ max_results: "100", "tweet.fields": "created_at,note_tweet", exclude: "retweets" });
    if (opts.sinceId) params.set("since_id", opts.sinceId);
    else if (opts.startTime) params.set("start_time", opts.startTime);
    if (next) params.set("pagination_token", next);
    const res = await fetch(`https://api.x.com/2/users/${opts.userId}/tweets?${params.toString()}`, {
      headers: { Authorization: `Bearer ${opts.token}`, "User-Agent": "lovely-memory-bot" },
    });
    if (!res.ok) throw new Error(`X API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const body = (await res.json()) as ApiResponse;
    out.push(...(body.data ?? []).map((p) => toCollected(p, opts.username)));
    next = body.meta?.next_token;
    if (!next) break;
  }
  return out;
}

/** ポスト id（数字の文字列）の大小比較 */
export function compareIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
