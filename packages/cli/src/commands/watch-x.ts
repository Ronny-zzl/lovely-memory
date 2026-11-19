import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveEvents } from "@lovely-memory/core";
import { loadArtist, loadEvents, loadOverrides, loadSongs, ARTISTS_DIR } from "../repo.ts";
import { setlistPath, writeSetlist } from "../setlist-build.ts";
import type { CollectedTweet } from "../tweet-match.ts";
import { compareIds, fetchUserPosts } from "../x-api.ts";
import { decide, jstLabel, pendingEvents, prune, startOf } from "../x-watch.ts";
import { successReply } from "./import-comment.ts";

type ArtistState = { sinceId?: string; tweets: CollectedTweet[]; handled: string[] };
type State = { artists: Record<string, ArtistState> };

/** Issue への返信（reply-issues が使う） */
export type IssueAction = { artistId: string; eventId: number; close: boolean; body: string };

/**
 * 公式 X のポストを読み、セトリ告知を自動で取り込む（GitHub Actions の定期実行用）。
 *
 *   pnpm lm watch-x <artistId|all> --state <state.json> --out <actions.json> [--commit-msg <file>] [--dry-run]
 *
 * - セトリを待っているイベント（開演済み・開演から 8 時間以内・未登録）が無ければ API を呼ばない
 * - X_BEARER_TOKEN 環境変数が必要（無ければ何もせずに終わる）
 * - state: 前回までに読んだポストと処理済みの告知。Actions のキャッシュに保存して次回に引き継ぐ
 * - out: 対応する Issue に書く返信。コミット・push の後で reply-issues に渡す
 * - --dry-run: 書き込まない。キャッシュも登録済みのセトリも無視するので、--now で過去の公演後を指定すると取り込みを試せる
 */
export async function watchX(target: string, opts: Record<string, unknown>) {
  if (typeof opts.state !== "string" || typeof opts.out !== "string") throw new Error("--state と --out が必要です");
  const statePath = opts.state;
  const dryRun = !!opts["dry-run"];
  const now = typeof opts.now === "string" ? new Date(opts.now) : new Date();
  const token = process.env.X_BEARER_TOKEN;

  // dry-run は確認用: キャッシュを使わず、登録済みのセトリも無いものとして「何を取り込むか」を表示する
  const state: State = existsSync(statePath) && !dryRun ? JSON.parse(await readFile(statePath, "utf8")) : { artists: {} };
  const actions: IssueAction[] = [];
  const imported: string[] = [];
  let read = 0;

  const ids =
    target === "all" ? (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name) : [target];

  for (const artistId of ids) {
    const artist = await loadArtist(artistId);
    const x = artist.sources.x;
    if (!x) continue;
    const songs = await loadSongs(artistId);
    const events = resolveEvents(await loadEvents(artistId), await loadOverrides(artistId), artist);
    const hasSetlist = (id: number) => !dryRun && existsSync(setlistPath(artistId, id));

    const pending = pendingEvents(events, hasSetlist, now);
    if (pending.length === 0) {
      console.log(`[${artistId}] セトリ待ちのイベントなし（API は呼ばない）`);
      continue;
    }
    console.log(`[${artistId}] セトリ待ち: ${pending.map((e) => `${e.date} ${e.start ?? ""} ${e.title}`).join(" / ")}`);
    if (!token) {
      console.log(`[${artistId}] X_BEARER_TOKEN が無いので読まない`);
      continue;
    }

    const st = (state.artists[artistId] ??= { tweets: [], handled: [] });
    // キャッシュが無い（初回・期限切れ）ときは、セトリ待ちの最も早い開演から読む
    const earliest = new Date(Math.min(...pending.map((e) => startOf(e).getTime())));
    const fresh = await fetchUserPosts({
      token,
      userId: x.userId,
      username: x.username,
      ...(st.sinceId ? { sinceId: st.sinceId } : { startTime: earliest.toISOString() }),
      // --now で過去の時点を指定したときは、その時点までのポストだけ読む
      ...(typeof opts.now === "string" && { endTime: now.toISOString() }),
    });
    read++;
    console.log(`[${artistId}] 新しいポスト ${fresh.length} 件`);
    for (const t of fresh)
      console.log(
        `  ${jstLabel(t.time)} ${t.url}  ${
          t.text
            .split("\n")
            .find((l) => l.trim())
            ?.slice(0, 40) ?? ""
        }`,
      );

    const byId = new Map([...st.tweets, ...fresh].map((t) => [t.id, t]));
    st.tweets = prune([...byId.values()], now);
    for (const t of fresh) if (!st.sinceId || compareIds(t.id, st.sinceId) > 0) st.sinceId = t.id;

    const handled = new Set(st.handled);
    for (const d of decide({ tweets: st.tweets, events, songs, artistName: artist.name, hasSetlist, handled, now })) {
      handled.add(d.key);
      if (d.kind === "ignore") {
        console.log(`[${artistId}] skip ${d.key}: ${d.reason}`);
        continue;
      }
      const at = jstLabel(d.post.time);
      if (d.kind === "import") {
        console.log(`[${artistId}] 取り込み ${d.event.date} ${d.event.title} ← ${d.post.url}`);
        if (!dryRun) await writeSetlist(artistId, d.setlist, d.event);
        imported.push(`${d.event.date} ${d.event.title}`);
        actions.push({
          artistId,
          eventId: d.event.id,
          close: true,
          body: successReply(artistId, d.event.id, d.setlist, d.warnings, "🤖 公式 X のポストから自動で"),
        });
      } else if (d.kind === "unknown-songs") {
        console.log(`[${artistId}] songs.json に無い曲: ${d.unknown.join(", ")} ← ${d.post.url}`);
        actions.push({
          artistId,
          eventId: d.event.id,
          close: false,
          body: [
            `🤖 公式 X のセトリ告知（${at}）を見つけましたが、songs.json に無い曲があるので取り込んでいません:`,
            ...d.unknown.map((u) => `- \`${u}\``),
            "",
            d.post.url,
            "",
            "表記ゆれなら songs.json の `aliases` に追加し、新曲・カバーなら `/add-unknown` の行を付けて、告知を貼り付けてコメントしてください。",
          ].join("\n"),
        });
      } else {
        console.log(`[${artistId}] イベントを特定できない: ${d.post.url}`);
        for (const e of d.candidates) {
          actions.push({
            artistId,
            eventId: e.id,
            close: false,
            body: [
              `🤖 公式 X のセトリ告知（${at}）を見つけましたが、どの公演のものか 1 つに絞れませんでした（候補 ${d.candidates.length} 件）。`,
              "",
              d.post.url,
              "",
              "この公演のセトリなら、告知を貼り付けてコメントしてください。",
            ].join("\n"),
          });
        }
      }
    }
    // キャッシュに残っているポストの分だけ覚えておく
    const kept = new Set(st.tweets.map((t) => t.id));
    st.handled = [...handled].filter((k) => kept.has(k.split("#")[0]!));
  }

  if (!dryRun) {
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(state) + "\n", "utf8");
  }
  await writeFile(opts.out, JSON.stringify(actions, null, 2) + "\n", "utf8");
  if (typeof opts["commit-msg"] === "string" && imported.length) {
    await writeFile(
      opts["commit-msg"],
      [`Setlist from X: ${imported.join(", ")}`, "", ...imported.map((t) => `- ${t}`)].join("\n") + "\n",
      "utf8",
    );
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `imported=${imported.length}\nactions=${actions.length}\nread=${read}\n`);
  }
  console.log(`取り込み ${imported.length} 件、Issue への返信 ${actions.length} 件${dryRun ? "（dry-run: 書き込みなし）" : ""}`);
}
