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
  // 雑談などのコメントには反応しない（曲番号もセトリ見出しも無い）
  if (!hasNumberedItems(comment.text) && !looksLikeSetlistAnnouncement(comment.text)) return finish("noop", "");

  const artist = await loadArtist(target.artistId);
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

  const site = siteUrl();
  const page = site ? `${site}#/${target.artistId}/events/${event.id}` : undefined;
  return finish(
    "success",
    [
      `✅ ${countSongs(result.setlist)} 曲を取り込みました${result.setlist.source ? `（出典: ${result.setlist.source}）` : ""}`,
      "",
      renderSetlist(result.setlist),
      warnings && `\n${warnings}`,
      page && `\nデプロイ後に反映されます: ${page}`,
      "\n修正したいときは、もう一度コメントすると上書きします。",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
