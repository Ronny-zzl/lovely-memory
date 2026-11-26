/*
 * 入力画面（プレビュー版のサイト）からのセトリの保存。POST /api/edit
 * - プレビュー版は Cloudflare Access で守られていて、通ったリクエストには Access の署名付きトークン（JWT）が付く。
 *   その署名・宛先（aud）・発行元・期限を確かめ、無い・正しくないものは断る（公開サイトへの直接のリクエストなど）
 * - 中身は GitHub Actions の apply-edit.yml に渡す（そこで packages/core の EditPayload で確かめて書き込み、コミットする）
 */
export type EditEnv = {
  /** Access のチーム（例: https://lovely-memory-pages.cloudflareaccess.com） */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access のアプリケーションの AUD タグ（プレビューの保護） */
  ACCESS_AUD?: string;
  /** ワークフローを起動するための GitHub の fine-grained トークン（Actions: Read and write だけ） */
  GITHUB_DISPATCH_TOKEN?: string;
  /** owner/repo */
  GITHUB_REPOSITORY?: string;
};

const WORKFLOW = "apply-edit.yml";
/** workflow_dispatch の入力の上限（65535 文字）より小さく */
const MAX_BYTES = 60 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const decode = <T>(part: string): T => JSON.parse(new TextDecoder().decode(b64url(part))) as T;

type Jwk = JsonWebKey & { kid?: string };
let certs: { team: string; keys: Jwk[]; at: number } | undefined;

/** Access の公開鍵（1 時間だけ覚えておく） */
async function accessKeys(team: string, now: number): Promise<Jwk[]> {
  if (certs && certs.team === team && now - certs.at < 3_600_000) return certs.keys;
  const res = await fetch(`${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  certs = { team, keys, at: now };
  return keys;
}

/** Access の JWT を確かめ、ログインしたメールアドレスを返す。正しくなければ undefined */
export async function verifyAccessJwt(token: string, team: string, aud: string, now = Date.now()): Promise<string | undefined> {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  const [h, p, sig] = parts as [string, string, string];
  try {
    const header = decode<{ alg?: string; kid?: string }>(h);
    const payload = decode<{ aud?: string | string[]; iss?: string; exp?: number; email?: string }>(p);
    if (header.alg !== "RS256") return undefined;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud) || payload.iss !== team || !payload.exp || payload.exp * 1000 < now) return undefined;
    const jwk = (await accessKeys(team, now)).find((k) => k.kid === header.kid);
    if (!jwk) return undefined;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    return ok ? (payload.email ?? "") : undefined;
  } catch {
    return undefined;
  }
}

/** リクエストに付いた Access のトークンから、ログインしたメールアドレス。無い・正しくなければ undefined */
export async function accessEmail(request: Request, env: Pick<EditEnv, "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD">): Promise<string | undefined> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return undefined;
  return verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
}

/** テスト用：覚えた公開鍵を捨てる */
export const resetAccessKeys = () => {
  certs = undefined;
};

/** 中身のざっとした確認（詳しくは Actions の apply-edit で確かめる） */
function looksLikePayload(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.artist === "string" && typeof o.event === "number" && Array.isArray(o.stages);
}

export async function handleEdit(request: Request, env: EditEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) {
    return json({ error: "not configured" }, 503);
  }
  const email = await accessEmail(request, env);
  if (!email) return json({ error: "ログインが必要です（プレビュー版から開いてください）" }, 401);

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BYTES) return json({ error: "大きすぎます" }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json({ error: "JSON ではありません" }, 400);
  }
  if (!looksLikePayload(parsed)) return json({ error: "セトリの形になっていません" }, 400);

  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lovely-memory-edit",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { payload: JSON.stringify(parsed) } }),
  });
  if (!res.ok) return json({ error: `保存の処理を始められませんでした（GitHub ${res.status}）` }, 502);
  // at：受け付けた時刻（サーバーの時計）。入力画面はこれより後のコミットがサイトに出たら「反映された」とする（version.json）
  return json({ ok: true, at: new Date().toISOString(), actions: `https://github.com/${env.GITHUB_REPOSITORY}/actions` }, 202);
}
