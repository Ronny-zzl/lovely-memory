import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseSetlistText, resolveEvents, type ResolvedEvent } from "@lovely-memory/core";
import { artistPath, loadArtist, loadEvents, loadOverrides, loadSongs, writeJson } from "../repo.ts";
import { buildSetlist, countSongs, setlistPath, writeSetlist } from "../setlist-build.ts";

async function readInput(file: unknown): Promise<string> {
  if (typeof file === "string") return readFile(file, "utf8");
  if (process.stdin.isTTY) throw new Error("セトリ告知文を標準入力か --file で渡してください（例: pbpaste | pnpm lm add-setlist …）");
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function pickEvent(events: ResolvedEvent[], opts: Record<string, unknown>): ResolvedEvent {
  if (typeof opts.event === "string") {
    const e = events.find((x) => x.id === Number(opts.event));
    if (!e) throw new Error(`event ${opts.event} が見つかりません（since 範囲外・hidden の可能性）`);
    return e;
  }
  if (typeof opts.date === "string") {
    const candidates = events.filter((e) => e.date === opts.date && e.type !== "tokuten");
    if (candidates.length === 1) return candidates[0]!;
    const list = candidates.map((e) => `  --event ${e.id}  ${e.start ?? "--:--"} ${e.title}`).join("\n");
    throw new Error(
      candidates.length === 0
        ? `${opts.date} のイベントがありません`
        : `${opts.date} に複数のイベントがあります。--event で指定してください:\n${list}`,
    );
  }
  throw new Error("--event <id> か --date <YYYY-MM-DD> を指定してください");
}

/**
 * 公式 X のセトリ告知文から setlists/<eventId>.yaml を作る。
 *
 *   pbpaste | pnpm lm add-setlist <artistId> (--event <id> | --date <YYYY-MM-DD>)
 *            [--source <ポストURL>] [--file <path>] [--add-unknown] [--force]
 */
export async function addSetlist(artistId: string, opts: Record<string, unknown>) {
  const artist = await loadArtist(artistId);
  const songs = await loadSongs(artistId);
  const events = resolveEvents(await loadEvents(artistId), await loadOverrides(artistId), artist);
  const event = pickEvent(events, opts);

  const outPath = setlistPath(artistId, event.id);
  if (existsSync(outPath) && !opts.force) throw new Error(`既に存在します: ${outPath}（上書きは --force）`);

  const parsed = parseSetlistText(await readInput(opts.file));
  if (parsed.length === 0) throw new Error("曲行（M1_ … 形式）が見つかりませんでした");

  const result = buildSetlist(parsed, songs, {
    eventId: event.id,
    source: typeof opts.source === "string" ? opts.source : undefined,
    addUnknown: !!opts["add-unknown"],
  });
  if (!result.setlist) {
    throw new Error(
      `songs.json に無い曲があります:\n${result.unknown.map((u) => `  - ${u}`).join("\n")}\n` +
        `表記ゆれなら songs.json の aliases に追加、新曲・カバーなら pnpm lm add-song で登録するか --add-unknown を付けて再実行してください`,
    );
  }

  const path = await writeSetlist(artistId, result.setlist, event);
  if (result.songsChanged) await writeJson(artistPath(artistId, "songs.json"), songs);
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  const stages = result.setlist.stages?.length ?? 1;
  console.log(
    `wrote ${path.slice(path.indexOf("artists/"))}: ${event.date} ${event.title} ` +
      `(${stages > 1 ? `${stages} stages, ` : ""}${countSongs(result.setlist)} songs)`,
  );
}
