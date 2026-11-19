import { appendFile, readFile, writeFile } from "node:fs/promises";
import {
  hasNumberedItems,
  looksLikeSetlistAnnouncement,
  parseSetlistText,
  resolveEvents,
  setlistStages,
  type Setlist,
} from "@lovely-memory/core";
import { parseComment, parseMarker } from "../issue.ts";
import { fetchSetlistText } from "../post-text.ts";
import { artistPath, loadArtist, loadEvents, loadOverrides, loadSongs, siteUrl, writeJson } from "../repo.ts";
import { buildSetlist, countSongs, writeSetlist } from "../setlist-build.ts";

/** ワークフローが次に何をするか（GITHUB_OUTPUT の status に書く） */
type Status = "success" | "skip" | "error" | "noop";

function renderSetlist(s: Setlist): string {
  const lines: string[] = [];
  const stages = setlistStages(s);
  for (const stage of stages) {
    if (stages.length > 1) lines.push(`**${stage.name ?? "ステージ"}**${stage.collab ? "（コラボ）" : ""}`);
    stage.items.forEach((item, i) => {
      const o = typeof item === "string" ? { song: item } : item;
      const extra = [o.note, "encore" in o && o.encore ? "EN" : undefined].filter(Boolean).join(" / ");
      lines.push(`${i + 1}. ${o.song}${extra ? `（${extra}）` : ""}`);
    });
  }
  if (s.note) lines.push("", `> ${s.note}`);
  return lines.join("\n");
}

/**
 * Issue コメントに貼られたセトリ告知を、Issue に紐づいたイベントのセトリとして取り込む。
 * 既存のセトリは上書きする（再コメントで修正できるように）。
 *
 *   pnpm lm import-comment --issue <issue本文のファイル> --file <コメントのファイル> --out <返信本文の出力先>
 */
export async function importComment(_target: string | undefined, opts: Record<string, unknown>) {
  if (typeof opts.issue !== "string" || typeof opts.file !== "string" || typeof opts.out !== "string") {
    throw new Error("--issue, --file, --out が必要です");
  }
  const target = parseMarker(await readFile(opts.issue, "utf8"));
  const comment = parseComment(await readFile(opts.file, "utf8"));
  const out = opts.out;

  const finish = async (status: Status, body: string) => {
    await writeFile(out, body, "utf8");
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `status=${status}\n`);
    console.log(`status=${status}`);
    if (body) console.log(body);
  };

  if (!target) return finish("noop", "");
  if (comment.skip) return finish("skip", "⏭️ セトリなしとして閉じます。取り込みたくなったら、閉じたままでもコメントすれば取り込みます。");
  const artist = await loadArtist(target.artistId);

  // ポストの URL だけが貼られたら、X API で本文を読む（X_BEARER_TOKEN が必要）
  const looksLikeSetlist = (t: string) => hasNumberedItems(t) || looksLikeSetlistAnnouncement(t);
  if (!looksLikeSetlist(comment.text) && comment.source && !comment.text.trim()) {
    const token = process.env.X_BEARER_TOKEN;
    if (!token) return finish("error", "❌ ポストの URL だけでは取り込めません（X_BEARER_TOKEN が未設定）。本文を貼り付けてください。");
    try {
      comment.text = await fetchSetlistText(token, artist, comment.source.split("/").at(-1)!);
    } catch (e) {
      return finish(
        "error",
        `❌ ポストを読めませんでした: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}\n\n本文を貼り付けてコメントしてください。`,
      );
    }
    if (!looksLikeSetlist(comment.text))
      return finish("error", "❌ このポストにはセトリが見つかりませんでした。セトリ告知のポストか確認してください。");
  }
  // 雑談などのコメントには反応しない（曲番号もセトリ見出しも無い）
  if (!looksLikeSetlist(comment.text)) return finish("noop", "");

  const songs = await loadSongs(target.artistId);
  const events = resolveEvents(await loadEvents(target.artistId), await loadOverrides(target.artistId), artist);
  const event = events.find((e) => e.id === target.eventId);
  if (!event) return finish("error", `❌ イベント ${target.eventId} が events.json に見つかりません。`);

  const parsed = parseSetlistText(comment.text);
  if (parsed.length === 0) {
    return finish("error", "❌ 曲を読み取れませんでした。`M1_ 曲名` の形式か、曲名を 1 行ずつ並べた形式で貼ってください。");
  }

  const result = buildSetlist(parsed, songs, {
    eventId: event.id,
    source: comment.source,
    addUnknown: comment.addUnknown,
  });
  const warnings = result.warnings.map((w) => `- ⚠️ ${w}`).join("\n");

  if (!result.setlist) {
    return finish(
      "error",
      [
        "❌ songs.json に無い曲があります:",
        ...result.unknown.map((u) => `- \`${u}\``),
        "",
        "表記ゆれなら songs.json の `aliases` に追加してから再コメント、新曲・カバーなら `/add-unknown` の行を付けて再コメントしてください。",
        warnings,
      ].join("\n"),
    );
  }

  await writeSetlist(target.artistId, result.setlist, event);
  if (result.songsChanged) await writeJson(artistPath(target.artistId, "songs.json"), songs);
  return finish("success", successReply(target.artistId, event.id, result.setlist, result.warnings));
}

/** 取り込めたときの返信（Issue コメント）。X からの自動取り込みでも使う */
export function successReply(artistId: string, eventId: number, setlist: Setlist, warnings: string[], lead = "✅"): string {
  const site = siteUrl();
  const page = site ? `${site}${artistId}/events/${eventId}` : undefined;
  return [
    `${lead} ${countSongs(setlist)} 曲を取り込みました${setlist.source ? `（出典: ${setlist.source}）` : ""}`,
    "",
    renderSetlist(setlist),
    warnings.length > 0 && `\n${warnings.map((w) => `- ⚠️ ${w}`).join("\n")}`,
    page && `\nデプロイ後に反映されます: ${page}`,
    "\n修正したいときは、もう一度コメントすると上書きします。",
  ]
    .filter(Boolean)
    .join("\n");
}
