import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { isLiveEvent, resolveEvents } from "@lovely-memory/core";
import { GitHub } from "../github.ts";
import { issueBody, issueTitle, parseMarker } from "../issue.ts";
import { ARTISTS_DIR, loadArtist, loadEvents, loadOverrides, siteUrl } from "../repo.ts";
import { setlistPath } from "../setlist-build.ts";
import { jstDateDaysAgo } from "./sync.ts";

export const SETLIST_LABEL = "setlist";

/**
 * 当日（と取りこぼした直近の数日）のライブごとに、セトリ入力用の Issue を作る。
 * 既にセトリがあるイベントや、Issue を作成済み（open / closed 問わず）のイベントは対象外。
 *
 *   pnpm lm open-setlist-issues <artistId|all> [--date YYYY-MM-DD] [--catch-up-days 7] [--dry-run]
 *
 * GITHUB_TOKEN と GITHUB_REPOSITORY（Actions では自動で入る）が必要。--dry-run なら無くても一覧だけ表示する。
 */
export async function openSetlistIssues(target: string, opts: Record<string, unknown>) {
  const dryRun = !!opts["dry-run"];
  const gh = GitHub.fromEnv();
  if (!gh && !dryRun) throw new Error("GITHUB_TOKEN と GITHUB_REPOSITORY が必要です（--dry-run なら不要）");

  const today = typeof opts.date === "string" ? opts.date : jstDateDaysAgo(0);
  const catchUp = typeof opts["catch-up-days"] === "string" ? Number(opts["catch-up-days"]) : 7;
  const from = jstDateDaysAgo(catchUp, new Date(`${today}T12:00:00+09:00`));

  const opened = new Set<string>();
  if (gh) {
    for (const issue of await gh.listIssues(SETLIST_LABEL)) {
      const t = parseMarker(issue.body ?? "");
      if (t) opened.add(`${t.artistId}:${t.eventId}`);
    }
  } else {
    console.warn("GITHUB_TOKEN が無いので既存 Issue との重複は確認していません");
  }

  const ids =
    target === "all" ? (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name) : [target];

  let created = 0;
  for (const artistId of ids) {
    const artist = await loadArtist(artistId);
    // 下書きのアーティストのセトリは、プレビューの入力画面から入れる（Issue は作らない）
    if (artist.draft) continue;
    const events = resolveEvents(await loadEvents(artistId), await loadOverrides(artistId), artist).filter(
      (e) =>
        isLiveEvent(e) &&
        e.date >= from &&
        e.date <= today &&
        !existsSync(setlistPath(artistId, e.id)) &&
        !opened.has(`${artistId}:${e.id}`),
    );
    for (const e of events) {
      const title = issueTitle(artist, e);
      if (dryRun || !gh) {
        console.log(`(dry-run) ${title}`);
        continue;
      }
      if (created === 0) await gh.ensureLabel(SETLIST_LABEL, "e0832b", "セトリ入力待ち（コメントに告知ポストを貼ると取り込み）");
      const n = await gh.createIssue({
        title,
        body: issueBody(artist, e, siteUrl()),
        labels: [SETLIST_LABEL],
        assignees: [gh.owner],
      });
      console.log(`#${n} ${title}`);
      created++;
    }
  }
  console.log(`${today}（${from} 以降の未入力分を含む）: ${dryRun ? "dry-run" : `${created} 件作成`}`);
}
