/*
 * プレビュー版に入れる人の管理（招待ページ /invite から使う）。/api/access
 * - 入れる人は Cloudflare Access の「アクセスグループ」のメールアドレスの一覧。プレビューのアプリケーションのポリシーが
 *   このグループを含めている。ここではそのグループの一覧を Cloudflare の API で読み書きする
 * - 使えるのは管理者（ACCESS_ADMIN_EMAILS）だけ。管理者自身はグループではなくポリシーに直接書いておく（消して締め出されないように）
 * - /api/me はログイン中の人のメールアドレスと、管理者かどうかを返す（ヘッダーのアカウントの表示）
 * - 秘密の値（API トークン・アカウント ID・グループ ID・管理者のメール）は wrangler pages secret put で設定する（リポジトリに書かない）
 */
import { accessEmail, type EditEnv } from "./edit.ts";

export type AccessEnv = Pick<EditEnv, "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD"> & {
  /** 管理者のメールアドレス（カンマ区切り） */
  ACCESS_ADMIN_EMAILS?: string;
  /** Cloudflare の API トークン（Access: Organizations, Identity Providers, and Groups の Edit だけ） */
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  /** 入れる人のアクセスグループの ID */
  ACCESS_GROUP_ID?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Rule = Record<string, unknown>;
type Group = { name: string; include: Rule[]; exclude?: Rule[]; require?: Rule[] };

const emailOf = (r: Rule): string | undefined => (r.email as { email?: string } | undefined)?.email?.toLowerCase();

/** Cloudflare の API。失敗したら status だけを返す（中身にアカウントの情報が入ることがあるので、そのまま返さない） */
async function cf<T>(env: Required<AccessEnv>, path: string, init?: { method: string; body: unknown }): Promise<T | number> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) return res.status;
  return ((await res.json()) as { result: T }).result;
}

const configured = (env: AccessEnv): env is Required<AccessEnv> =>
  !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && env.ACCESS_ADMIN_EMAILS && env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.ACCESS_GROUP_ID);

/**
 * GET → { me, members: [メール] }
 * POST { add: メール } → グループに足す。POST { remove: メール } → グループから外し、ログイン中のセッションも切る
 */
export async function handleAccess(request: Request, env: AccessEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!configured(env)) return json({ error: "設定されていません" }, 503);
  const me = (await accessEmail(request, env))?.toLowerCase();
  if (!me) return json({ error: "ログインが必要です（プレビュー版から開いてください）" }, 401);
  const admins = env.ACCESS_ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase());
  if (!admins.includes(me)) return json({ error: "管理者だけが使えます" }, 403);

  const groupPath = `groups/${env.ACCESS_GROUP_ID}`;
  const group = await cf<Group>(env, groupPath);
  if (typeof group === "number") return json({ error: `グループを読み込めませんでした（Cloudflare ${group}）` }, 502);
  const members = () => group.include.map(emailOf).filter((e): e is string => !!e);
  if (request.method === "GET") return json({ me, members: members() });

  let body: { add?: unknown; remove?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "JSON ではありません" }, 400);
  }
  const target = typeof body.add === "string" ? body.add : typeof body.remove === "string" ? body.remove : undefined;
  const email = target?.trim().toLowerCase();
  if (!email || !EMAIL.test(email)) return json({ error: "メールアドレスの形になっていません" }, 400);

  if (typeof body.add === "string") {
    if (members().includes(email)) return json({ me, members: members() });
    group.include = [...group.include, { email: { email } }];
  } else {
    group.include = group.include.filter((r) => emailOf(r) !== email);
  }
  const saved = await cf<Group>(env, groupPath, {
    method: "PUT",
    body: { name: group.name, include: group.include, exclude: group.exclude ?? [], require: group.require ?? [] },
  });
  if (typeof saved === "number") return json({ error: `保存できませんでした（Cloudflare ${saved}）` }, 502);
  // 外した人がログイン中なら、そのセッションを切る（失敗しても、セッションの期限が来れば入れなくなる）
  if (typeof body.remove === "string") await cf(env, "organizations/revoke_user", { method: "POST", body: { email } });
  return json({ me, members: saved.include.map(emailOf).filter((e): e is string => !!e) });
}

/** GET /api/me → { email, admin }：プレビュー版のヘッダーの「アカウント」に、ログイン中のメールアドレスを出す */
export async function handleMe(request: Request, env: AccessEnv): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
  const email = (await accessEmail(request, env))?.toLowerCase();
  if (!email) return json({ error: "ログインしていません" }, 401);
  const admins = (env.ACCESS_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase());
  return json({ email, admin: admins.includes(email) });
}
