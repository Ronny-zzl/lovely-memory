import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveEvents } from "@lovely-memory/core";
import { artistPath, loadArtist, loadEvents, loadOverrides, loadSongs, writeJson } from "../repo.ts";
import { buildSetlist, countSongs, setlistPath, writeSetlist } from "../setlist-build.ts";
import { extractPosts, matchPosts, toJst, type CollectedTweet, type SetlistPost } from "../tweet-match.ts";

type Mapping = Record<string, number | "skip" | null>;

const keyOf = (p: SetlistPost) => (p.part ? `${p.id}#${p.part}` : p.id);
const firstLine = (p: SetlistPost) =>
  p.text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean)
    ?.slice(0, 50) ?? "";

/**
 * x-setlist-collector.js で集めたポスト（JSON）からセトリを一括登録する。
 *
 *   pnpm lm import-setlists <artistId> --file tweets.json [--map map.json] [--dry-run] [--add-unknown] [--force]
 *
 * 対応付けできなかった告知は <file と同じディレクトリ>/setlist-map.json に雛形を書き出す。
 * イベント id（または "skip"）を書き込んで --map に渡し、再実行する。
 */
export async function importSetlists(artistId: string, opts: Record<string, unknown>) {
  if (typeof opts.file !== "string") throw new Error("--file <tweets.json> を指定してください");
  const raw = JSON.parse(await readFile(opts.file, "utf8"));
  const tweets: CollectedTweet[] = Array.isArray(raw) ? raw : raw.tweets;
  const mapPath = typeof opts.map === "string" ? opts.map : join(dirname(opts.file), "setlist-map.json");
  const mapping: Mapping = existsSync(mapPath) ? JSON.parse(await readFile(mapPath, "utf8")) : {};
  const manual = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== null)) as Record<string, number | "skip">;

  const artist = await loadArtist(artistId);
  const songs = await loadSongs(artistId);
  const events = resolveEvents(await loadEvents(artistId), await loadOverrides(artistId), artist);
  const dryRun = !!opts["dry-run"];

  const posts = extractPosts(tweets);
  const results = matchPosts(posts, events, manual);

  const written: string[] = [];
  const exists: string[] = [];
  const truncated: string[] = [];
  const todo: Mapping = {};
  const todoLines: string[] = [];
  const unknownSongs = new Map<string, string[]>();
  const warnings = new Set<string>();
  let songsChanged = false;

  for (const r of results) {
    const p = r.post;
    const label = `${toJst(p.time).replace("T", " ")} ${firstLine(p)}`;
    if (r.kind !== "matched") {
      todo[keyOf(p)] = mapping[keyOf(p)] ?? null;
      const cands =
        r.kind === "ambiguous"
          ? r.candidates.map((e) => `      ${e.id}  ${e.date} ${e.start ?? "--:--"} ${e.title}`).join("\n")
          : "      （候補なし: events.json に無い・since 範囲外・特典会のみ など）";
      todoLines.push(`  "${keyOf(p)}"  ${label}\n    ${p.url}\n${cands}`);
      continue;
    }
    const ev = r.event;
    const where = `${ev.date} ${ev.title}`;
    if (p.truncated) {
      truncated.push(`  ${where}\n    ${p.url}`);
      continue;
    }
    if (existsSync(setlistPath(artistId, ev.id)) && !opts.force) {
      exists.push(`  ${where}`);
      continue;
    }
    const built = buildSetlist(p.stages, songs, { eventId: ev.id, source: p.url, addUnknown: !!opts["add-unknown"] });
    built.warnings.forEach((w) => warnings.add(w));
    songsChanged ||= built.songsChanged;
    if (!built.setlist) {
      for (const u of built.unknown) unknownSongs.set(u, [...(unknownSongs.get(u) ?? []), where]);
      continue;
    }
    if (!dryRun) await writeSetlist(artistId, built.setlist, ev);
    written.push(`  ${where}  (${countSongs(built.setlist)} 曲, ${r.reason})`);
  }

  if (songsChanged && !dryRun) await writeJson(artistPath(artistId, "songs.json"), songs);

  const section = (title: string, lines: string[]) => {
    if (lines.length) console.log(`\n${title} (${lines.length})\n${lines.join("\n")}`);
  };
  console.log(`ポスト ${tweets.length} 件 → セトリ告知 ${posts.length} 件${dryRun ? "（dry-run: 書き込みなし）" : ""}`);
  section("✔ 登録", written);
  section("= 既に登録済み（上書きは --force）", exists);
  section("⚠ 本文が途中で切れている → ポストを開いて全文を収集し直してください", truncated);
  section(
    "✗ songs.json に無い曲 → aliases に追加 / pnpm lm add-song / --add-unknown",
    [...unknownSongs].map(([s, w]) => `  ${s}\n    ${w.join("\n    ")}`),
  );
  section(`? イベントを特定できない → ${mapPath} にイベント id か "skip" を書いて再実行`, todoLines);
  for (const w of warnings) console.warn(`warning: ${w}`);

  if (Object.keys(todo).length) {
    await writeFile(mapPath, JSON.stringify({ ...mapping, ...todo }, null, 2) + "\n", "utf8");
  }
}
