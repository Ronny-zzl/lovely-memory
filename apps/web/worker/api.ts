/*
 * サイトの API（/api/*）。Cloudflare Pages の _worker.js として動かすほか、
 * 開発時・プレビュー時は Vite のミドルウェアから同じ関数を呼ぶ（plugins/api-dev.ts）。
 */
import { AttendedError, fetchAttended, USERNAME_PATTERN } from "@lovely-memory/eventernote/attended";
import { receiveError, type D1 } from "./errors.ts";
import { handleEdit, type EditEnv } from "./edit.ts";
import { handleXWebhook, type XWebhookEnv } from "./x-webhook.ts";

/** Pages のバインディング（wrangler.toml）。開発時・プレビュー（vite）には無い */
export type ApiEnv = { DB?: D1 } & XWebhookEnv & EditEnv;

const USER_AGENT = "Mozilla/5.0 (compatible; lovely-memory-bot/0.1; setlist statistics)";
/** 同じユーザーを短時間に何度も読みに行かないよう、結果をこの秒数だけキャッシュする */
const CACHE_SECONDS = 600;

const json = (body: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });

/** /api/eventernote/<ユーザー名>?since=YYYY-MM-DD → { user, events: [{ id, date }], pages, truncated } */
async function eventernoteAttended(request: Request, user: string): Promise<Response> {
  const since = new URL(request.url).searchParams.get("since") ?? "";
  if (!USERNAME_PATTERN.test(user)) return json({ error: "ユーザー名の形式が正しくありません" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return json({ error: "since（YYYY-MM-DD）が必要です" }, 400);

  // Workers の Cache API（開発時の Node には無い）
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(new URL(`/api/eventernote/${user.toLowerCase()}?since=${since}`, request.url).toString());
  const hit = await cache?.match(key);
  if (hit) return hit;

  try {
    const result = await fetchAttended(user, { since, userAgent: USER_AGENT, maxPages: 10, delayMs: 500 });
    const res = json({ user, ...result }, 200, CACHE_SECONDS);
    await cache?.put(key, res.clone());
    return res;
  } catch (e) {
    if (e instanceof AttendedError) {
      return json({ error: e.message }, e.status === "invalid" ? 400 : e.status === "not-found" ? 404 : 502);
    }
    return json({ error: "読み込みに失敗しました" }, 502);
  }
}

/** /api/* を処理する。該当しなければ undefined */
export async function handleApi(request: Request, env: ApiEnv = {}): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return undefined;
  if (url.pathname === "/api/errors") {
    return request.method === "POST" ? receiveError(request, env.DB) : json({ error: "method not allowed" }, 405);
  }
  if (url.pathname === "/api/x-webhook") return handleXWebhook(request, env);
  if (url.pathname === "/api/edit") return handleEdit(request, env);
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
  const m = url.pathname.match(/^\/api\/eventernote\/([^/]+)\/?$/);
  if (m) return eventernoteAttended(request, decodeURIComponent(m[1]!));
  return json({ error: "not found" }, 404);
}
