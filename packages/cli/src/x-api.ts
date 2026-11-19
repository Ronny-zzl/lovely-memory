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
  /** この時刻までのポストだけ（確認用に過去の時点を再現するとき） */
  endTime?: string;
}): Promise<CollectedTweet[]> {
  const out: CollectedTweet[] = [];
  let next: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ max_results: "100", "tweet.fields": "created_at,note_tweet", exclude: "retweets" });
    if (opts.sinceId) params.set("since_id", opts.sinceId);
    else if (opts.startTime) params.set("start_time", opts.startTime);
    if (opts.endTime) params.set("end_time", opts.endTime);
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

/** Webhook・購読の管理 API（アプリのベアラートークン） */
async function xApi<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.x.com/2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "lovely-memory-bot",
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X API ${method} ${path} ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export type Webhook = { id: string; url: string; valid: boolean; created_at?: string };

export const listWebhooks = async (token: string) => (await xApi<{ data?: Webhook[] }>(token, "GET", "/webhooks")).data ?? [];
export const registerWebhook = async (token: string, url: string) =>
  (await xApi<{ data: Webhook }>(token, "POST", "/webhooks", { url })).data;
export const deleteWebhook = (token: string, id: string) => xApi(token, "DELETE", `/webhooks/${id}`);
/** CRC をやり直して、無効になった Webhook を有効に戻す */
export const revalidateWebhook = (token: string, id: string) => xApi(token, "PUT", `/webhooks/${id}`);

export type Subscription = {
  subscription_id: string;
  event_type: string;
  filter?: { user_id?: string };
  tag?: string;
  webhook_id?: string;
};

export async function listSubscriptions(token: string): Promise<Subscription[]> {
  return (await xApi<{ data?: Subscription[] }>(token, "GET", "/activity/subscriptions")).data ?? [];
}

/** post.create の購読を作り、id を返す（レスポンスは data か data.subscription のどちらかに入る） */
export async function createSubscription(token: string, opts: { userId: string; webhookId: string; tag: string }): Promise<string> {
  const res = await xApi<{ data?: Subscription & { subscription?: Subscription } }>(token, "POST", "/activity/subscriptions", {
    event_type: "post.create",
    filter: { user_id: opts.userId },
    webhook_id: opts.webhookId,
    tag: opts.tag,
  });
  return res.data?.subscription_id ?? res.data?.subscription?.subscription_id ?? "?";
}

export const deleteSubscription = (token: string, id: string) => xApi(token, "DELETE", `/activity/subscriptions/${id}`);
