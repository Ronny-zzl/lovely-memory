/*
 * ブラウザで起きたエラーを受け取って D1（client_errors）に残す。POST /api/errors
 * Pages の Functions のログは保存されないので、あとから見られるようにデータベースに書く。
 * 中身は pnpm lm errors で見る。
 */

/** Pages の D1 バインディングのうち、ここで使う部分 */
export type D1 = {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
};

export type ErrorReport = {
  kind: "error" | "rejection" | "render";
  message: string;
  stack?: string;
  path?: string;
  build?: string;
};

/** 1 件の大きさの上限（スタックトレースが長くてもこれで足りる） */
const MAX_BYTES = 8 * 1024;
/** 古い記録を消す日数 */
const KEEP_DAYS = 90;
const KINDS = new Set(["error", "rejection", "render"]);

const cut = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : undefined);

/** 受け取った JSON を確かめて整える（おかしければ undefined） */
export function parseReport(body: unknown): ErrorReport | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const message = cut(b.message, 500);
  if (typeof b.kind !== "string" || !KINDS.has(b.kind) || !message) return undefined;
  return {
    kind: b.kind as ErrorReport["kind"],
    message,
    stack: cut(b.stack, 4000),
    path: cut(b.path, 300),
    build: cut(b.build, 20),
  };
}

const empty = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function receiveError(request: Request, db: D1 | undefined): Promise<Response> {
  // このサイトのページから送られたものだけ受け付ける（ブラウザは POST に Origin を付ける）
  if (request.headers.get("origin") !== new URL(request.url).origin) return empty(403);
  const text = await request.text();
  if (text.length > MAX_BYTES) return empty(413);
  let report: ErrorReport | undefined;
  try {
    report = parseReport(JSON.parse(text));
  } catch {
    report = undefined;
  }
  if (!report) return empty(400);

  if (!db) {
    // 開発時・プレビュー（vite）には D1 が無いので、ターミナルに出すだけ
    console.warn("[client error]", report.kind, report.message, report.path ?? "");
    return empty(204);
  }
  const userAgent = cut(request.headers.get("user-agent"), 300) ?? null;
  await db
    .prepare("INSERT INTO client_errors (kind, message, stack, path, build, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(report.kind, report.message, report.stack ?? null, report.path ?? null, report.build ?? null, userAgent)
    .run();
  // 古い記録はときどき消す（100 件に 1 回くらい）
  if (Math.random() < 0.01) {
    await db.prepare(`DELETE FROM client_errors WHERE at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-${KEEP_DAYS} days')`).bind().run();
  }
  return empty(204);
}
