import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import YAML from "yaml";
import {
  findSong,
  parseSetlistText,
  resolveEvents,
  Setlist,
  type ResolvedEvent,
  type SetlistItem,
  type SetlistStage,
  type Song,
} from "@lovely-memory/core";
import { artistPath, loadArtist, loadEvents, loadOverrides, loadSongs, writeJson } from "../repo";
import { nextSongId } from "../songs-merge";

/** 告知文の末尾タグのうち、記録しないもの（初披露は集計で算出するため） */
const IGNORED_TAGS = /^(新曲|初披露|new)$/i;

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

  const outPath = artistPath(artistId, "setlists", `${event.id}.yaml`);
  if (existsSync(outPath) && !opts.force) throw new Error(`既に存在します: ${outPath}（上書きは --force）`);

  const parsed = parseSetlistText(await readInput(opts.file));
  if (parsed.length === 0) throw new Error("曲行（M1_ … 形式）が見つかりませんでした");

  const unknown: string[] = [];
  const warnings: string[] = [];
  let songsChanged = false;

  const resolveItem = (p: (typeof parsed)[number]["items"][number]): SetlistItem => {
    let song: Song | undefined = findSong(songs, p);
    if (!song && opts["add-unknown"]) {
      song = { id: nextSongId(songs), title: p.title, aliases: [], credits: Object.keys(p.credits).length ? p.credits : undefined };
      songs.push(song);
      songsChanged = true;
      warnings.push(`曲を追加しました: ${song.id} ${song.title}（era / unit / cover は songs.json で補ってください）`);
    }
    if (!song) {
      unknown.push(p.label);
      return p.title;
    }
    // 告知文のクレジットは公式サイトより優先度が低い：空き項目だけ埋め、食い違いは警告
    for (const [k, v] of Object.entries(p.credits) as [keyof NonNullable<Song["credits"]>, string][]) {
      const cur = song.credits?.[k];
      if (!cur) {
        song.credits = { ...song.credits, [k]: v };
        songsChanged = true;
      } else if (cur !== v) {
        warnings.push(`クレジット不一致 ${song.title} ${k}: songs.json「${cur}」/ 告知「${v}」`);
      }
    }
    const note = p.tags.filter((t) => !IGNORED_TAGS.test(t)).join(" / ") || undefined;
    return p.encore || note ? { song: song.title, ...(p.encore && { encore: true }), ...(note && { note }) } : song.title;
  };

  const stages: SetlistStage[] = parsed.map((s) => ({
    ...(s.name && { name: s.name }),
    items: s.items.map(resolveItem),
  }));

  if (unknown.length) {
    throw new Error(
      `songs.json に無い曲があります:\n${unknown.map((u) => `  - ${u}`).join("\n")}\n` +
        `表記ゆれなら songs.json の aliases に追加、新曲・カバーなら pnpm lm add-song で登録するか --add-unknown を付けて再実行してください`,
    );
  }

  const setlist = Setlist.parse({
    event: event.id,
    ...(typeof opts.source === "string" && { source: opts.source }),
    ...(stages.length === 1 ? { items: stages[0]!.items } : { stages }),
  });

  const doc = new YAML.Document(setlist);
  doc.commentBefore = ` ${event.date} ${event.title}`;
  await mkdir(artistPath(artistId, "setlists"), { recursive: true });
  await writeFile(outPath, doc.toString({ lineWidth: 0 }), "utf8");
  if (songsChanged) await writeJson(artistPath(artistId, "songs.json"), songs);

  for (const w of warnings) console.warn(`warning: ${w}`);
  const count = stages.reduce((n, s) => n + s.items.length, 0);
  console.log(
    `wrote ${outPath.slice(outPath.indexOf("artists/"))}: ${event.date} ${event.title} ` +
      `(${stages.length > 1 ? `${stages.length} stages, ` : ""}${count} songs)`,
  );
}
