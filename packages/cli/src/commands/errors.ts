import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { REPO_ROOT } from "../repo.ts";

/*
 * ブラウザで起きたエラー（D1 の client_errors、/api/errors で記録）を見る。
 * wrangler でログインしている Cloudflare アカウントから読む（wrangler login）。
 */

type Row = {
  kind: string;
  message: string;
  stack: string | null;
  path: string | null;
  build: string | null;
  user_agent: string | null;
  at: string;
};

const run = promisify(execFile);

async function query(sql: string): Promise<Row[]> {
  const { stdout } = await run("pnpm", ["exec", "wrangler", "d1", "execute", "lovely-memory", "--remote", "--json", "--command", sql], {
    cwd: join(REPO_ROOT, "apps/web"),
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = JSON.parse(stdout) as Array<{ results: Row[] }>;
  return out.flatMap((r) => r.results);
}

/** UA から大まかなブラウザ名だけ取り出す（一覧で見やすく） */
function browser(ua: string | null): string {
  if (!ua) return "?";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : "";
  const name = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "?";
  const version = ua.match(/(?:Version|Chrome|Firefox|Edg)\/(\d+)/)?.[1];
  return `${name}${version ? ` ${version}` : ""}${os ? ` (${os})` : ""}`;
}

/** pnpm lm errors all [--days 7] … 同じエラーをまとめて、回数の多い順に表示 */
export async function errors(_artistId: string, opts: { days?: string }): Promise<void> {
  const days = Number(opts.days ?? 7);
  if (!Number.isInteger(days) || days <= 0) throw new Error("--days は正の整数");
  const rows = await query(
    `SELECT kind, message, stack, path, build, user_agent, at FROM client_errors WHERE at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-${days} days') ORDER BY at DESC`,
  );
  if (!rows.length) {
    console.log(`直近 ${days} 日のエラーはありません`);
    return;
  }
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.message}\n${r.stack?.split("\n")[1]?.trim() ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  console.log(`直近 ${days} 日: ${rows.length} 件（${groups.size} 種類）\n`);
  for (const list of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const first = list[0]!;
    const paths = [...new Set(list.map((r) => r.path ?? "?"))];
    const builds = [...new Set(list.map((r) => r.build ?? "?"))];
    const browsers = [...new Set(list.map((r) => browser(r.user_agent)))];
    console.log(`■ ${list.length} 件  [${first.kind}]  ${first.message}`);
    console.log(`  最後: ${first.at}  ビルド: ${builds.join(", ")}`);
    console.log(`  ページ: ${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ` ほか ${paths.length - 5}` : ""}`);
    console.log(`  ブラウザ: ${browsers.slice(0, 5).join(", ")}`);
    if (first.stack)
      console.log(
        first.stack
          .split("\n")
          .slice(0, 6)
          .map((l) => `    ${l.trim()}`)
          .join("\n"),
      );
    console.log("");
  }
}
