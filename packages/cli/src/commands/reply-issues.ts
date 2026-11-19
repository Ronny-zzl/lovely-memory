import { readFile } from "node:fs/promises";
import { GitHub } from "../github.ts";
import { parseMarker } from "../issue.ts";
import { SETLIST_LABEL } from "./open-setlist-issues.ts";
import type { IssueAction } from "./watch-x.ts";

/**
 * watch-x が書き出した返信を、イベントごとのセトリ入力用 Issue にコメントする（取り込めたものは閉じる）。
 * Issue が無いイベント（Issue を作る前に取り込んだ等）は飛ばす。
 *
 *   pnpm lm reply-issues --file <actions.json>
 */
export async function replyIssues(_target: string | undefined, opts: Record<string, unknown>) {
  if (typeof opts.file !== "string") throw new Error("--file が必要です");
  const actions = JSON.parse(await readFile(opts.file, "utf8")) as IssueAction[];
  if (actions.length === 0) return;
  const gh = GitHub.fromEnv();
  if (!gh) throw new Error("GITHUB_TOKEN と GITHUB_REPOSITORY が必要です");

  const issues = new Map<string, number>();
  for (const issue of await gh.listIssues(SETLIST_LABEL)) {
    const t = parseMarker(issue.body ?? "");
    if (t) issues.set(`${t.artistId}:${t.eventId}`, issue.number);
  }
  for (const a of actions) {
    const number = issues.get(`${a.artistId}:${a.eventId}`);
    if (number === undefined) {
      console.log(`${a.artistId} ${a.eventId}: Issue が無いので返信しない`);
      continue;
    }
    await gh.comment(number, a.body);
    if (a.close) await gh.closeIssue(number);
    console.log(`#${number} に返信${a.close ? "して閉じた" : ""}`);
  }
}
