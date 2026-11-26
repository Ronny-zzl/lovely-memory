import { execFileSync } from "node:child_process";
import { appendFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ARTISTS_DIR, loadArtist, REPO_ROOT } from "../repo.ts";

/**
 * 公開サイトをデプロイし直す必要があるか（deploy.yml の production ジョブが使う）。
 *
 *   pnpm lm site-changes [--since <公開サイトにデプロイ済みのコミット>]
 *
 * 公開サイトの version.json にあるコミットから今のコミットまでに変わったファイルが、すべて下書きのグループ（artist.json の draft）の
 * データなら、公開サイトの中身は変わらないので不要。分からないとき（--since が無い・そのコミットが無い）は必要とする。
 * GitHub Actions では GITHUB_OUTPUT に deploy=true / false を書く。
 */
export async function siteChanges(_target: string | undefined, opts: Record<string, unknown>) {
  const since = typeof opts.since === "string" && /^[0-9a-f]{7,40}$/.test(opts.since) ? opts.since : undefined;
  const drafts: string[] = [];
  for (const d of await readdir(ARTISTS_DIR, { withFileTypes: true })) {
    if (d.isDirectory() && (await loadArtist(d.name)).draft) drafts.push(d.name);
  }
  const files = since ? changedFiles(since) : undefined;
  const { deploy, reason } = needsPublicDeploy(files, drafts);
  console.log(`${deploy ? "デプロイする" : "デプロイしない"}：${reason}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
}

/** since から HEAD までに変わったファイル。since が手元に無ければ undefined */
function changedFiles(since: string): string[] | undefined {
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${since}..HEAD`], { cwd: REPO_ROOT, encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    return undefined;
  }
}

/** 変わったファイル（分からなければ undefined）と下書きのグループから、公開サイトのデプロイが要るか */
export function needsPublicDeploy(files: string[] | undefined, drafts: string[]): { deploy: boolean; reason: string } {
  if (!files) return { deploy: true, reason: "デプロイ済みのコミットが分からない" };
  if (files.length === 0) return { deploy: false, reason: "デプロイ済みのコミットから変更なし" };
  const inDraft = (f: string) => drafts.some((d) => f.startsWith(join("artists", d) + "/"));
  const others = files.filter((f) => !inDraft(f));
  if (others.length === 0)
    return { deploy: false, reason: `変わったのは下書きのグループ（${drafts.join("・")}）のデータだけ（${files.length} ファイル）` };
  return {
    deploy: true,
    reason: `${others.length} ファイルが変わった（${others.slice(0, 3).join(", ")}${others.length > 3 ? " ほか" : ""}）`,
  };
}
