/*
 * X の Webhook（X Activity API の post.create）を受け取る。/api/x-webhook
 * - GET ?crc_token=…: X が Webhook を確かめるための CRC。秘密鍵で HMAC を返す
 * - POST: 公式アカウントのポスト。署名を確かめ、セトリ告知らしければ GitHub の watch-x ワークフローを起動する（workflow_dispatch）
 *   （取り込み自体はワークフローの watch-x がいつもどおり X API で読んで行う）
 * 受け取ったものは D1（x_events）に残す。中身の確認用
 */
import type { D1 } from "./errors.ts";

export type XWebhookEnv = {
  DB?: D1;
  /** X の App の OAuth 2.0 Client Secret（CRC と署名の鍵） */
  X_WEBHOOK_SECRET?: string;
  /** ワークフローを起動するための GitHub の fine-grained トークン（このリポジトリの Actions: Read and write だけ） */
  GITHUB_DISPATCH_TOKEN?: string;
  /** owner/repo */
  GITHUB_REPOSITORY?: string;
};

/** セトリ告知・その続きらしいポスト（見出しに「セトリ」等がある、または曲番号の行がある） */
const SETLIST_LIKE = /セトリ|セットリスト|set\s*list|^\s*(M|EN)\s*\d/im;
const KEEP_DAYS = 30;
const MAX_BYTES = 256 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function hmacBase64(secret: string, message: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = typeof message === "string" ? new TextEncoder().encode(message) : message;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return btoa(String.fromCharCode(...sig));
}

/** 長さが同じなら、どこで違っても同じ時間で比べる */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function crcResponse(secret: string, crcToken: string): Promise<{ response_token: string }> {
  return { response_token: `sha256=${await hmacBase64(secret, crcToken)}` };
}

export async function validSignature(secret: string, body: Uint8Array<ArrayBuffer>, header: string | null): Promise<boolean> {
  if (!header) return false;
  return safeEqual(header, `sha256=${await hmacBase64(secret, body)}`);
}

type PostEvent = { eventType: string; postId?: string; authorId?: string; text: string };

/** 届いた JSON から必要なところだけ取り出す（data.event_type / data.payload.{id,author_id,text}） */
export function parseEvent(body: unknown): PostEvent | undefined {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data.event_type !== "string") return undefined;
  const p = (data.payload ?? {}) as Record<string, unknown>;
  const note = (p.note_tweet as { text?: unknown } | undefined)?.text;
  const text = typeof note === "string" ? note : typeof p.text === "string" ? p.text : "";
  return {
    eventType: data.event_type,
    postId: typeof p.id === "string" ? p.id : undefined,
    authorId: typeof p.author_id === "string" ? p.author_id : undefined,
    text,
  };
}

export const isSetlistLike = (e: PostEvent) => e.eventType === "post.create" && SETLIST_LIKE.test(e.text);

async function record(db: D1 | undefined, e: PostEvent | undefined, raw: string, dispatched: string) {
  if (!db) return;
  await db
    .prepare("INSERT INTO x_events (at, event_type, post_id, text, dispatched, raw) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(new Date().toISOString(), e?.eventType ?? null, e?.postId ?? null, e?.text.slice(0, 2000) ?? null, dispatched, raw.slice(0, 8000))
    .run();
  if (Math.random() < 0.05) {
    await db
      .prepare("DELETE FROM x_events WHERE at < ?")
      .bind(new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString())
      .run();
  }
}

const WORKFLOW = "watch-x.yml";

async function dispatch(env: XWebhookEnv): Promise<string> {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) return "no-token";
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lovely-memory-webhook",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  return res.ok ? "ok" : `error ${res.status}`;
}

export async function handleXWebhook(request: Request, env: XWebhookEnv): Promise<Response> {
  const secret = env.X_WEBHOOK_SECRET;
  if (!secret) return json({ error: "not configured" }, 503);

  if (request.method === "GET") {
    const token = new URL(request.url).searchParams.get("crc_token");
    return token ? json(await crcResponse(secret, token)) : json({ error: "crc_token required" }, 400);
  }
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BYTES) return json({ error: "too large" }, 413);
  const signature = request.headers.get("x-twitter-webhooks-signature-oauth2") ?? request.headers.get("x-twitter-webhooks-signature");
  if (!(await validSignature(secret, body, signature))) return json({ error: "invalid signature" }, 401);

  const raw = new TextDecoder().decode(body);
  let event: PostEvent | undefined;
  try {
    event = parseEvent(JSON.parse(raw));
  } catch {
    event = undefined;
  }
  const dispatched = event && isSetlistLike(event) ? await dispatch(env) : "skip";
  await record(env.DB, event, raw, dispatched);
  // X には常に 200 を返す（再送させない。起動に失敗しても 1 時間ごとの見回りで拾う）
  return json({ ok: true });
}
