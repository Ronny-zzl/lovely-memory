/**
 * Issue コメントにポストの URL だけが貼られたとき、X API でポストの本文を読む。
 * 公式アカウントのポストなら、20 分以内に続けて投稿されたスレッドの続き（M9_ … など）も合わせる。
 */
import type { ArtistConfig } from "@lovely-memory/core";
import { extractPosts } from "./tweet-match.ts";
import { fetchPost, fetchUserPosts, toCollected } from "./x-api.ts";

/** スレッドの続きを探す時間（tweet-match の結合条件と同じ） */
const THREAD_MINUTES = 20;

export async function fetchSetlistText(token: string, artist: ArtistConfig, postId: string): Promise<string> {
  const post = await fetchPost(token, postId);
  const x = artist.sources.x;
  if (!x || post.author_id !== x.userId) return toCollected(post, "").text;

  const start = new Date(post.created_at);
  const later = await fetchUserPosts({
    token,
    userId: x.userId,
    username: x.username,
    startTime: new Date(start.getTime() + 1000).toISOString(),
    endTime: new Date(start.getTime() + THREAD_MINUTES * 60_000).toISOString(),
  });
  const first = toCollected(post, x.username);
  // 続きの結合は一括取り込みと同じ規則（直前の最終曲番号 +1 から始まる・20 分以内）
  const group = extractPosts([first, ...later]).find((p) => p.id === first.id);
  return group?.text ?? first.text;
}
