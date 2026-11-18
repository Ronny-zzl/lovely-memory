import { readdir } from "node:fs/promises";
import { findSong, isLiveEvent, normalizeTitle, resolveEvents, Setlist, setlistStages } from "@lovely-memory/core";
import { ARTISTS_DIR, loadArtist, loadEvents, loadOverrides, loadSetlistFiles, loadSongs } from "../repo.ts";
import { jstDateDaysAgo } from "./sync.ts";

async function validateOne(artistId: string, showMissing: boolean): Promise<number> {
  const errors: string[] = [];
  const warns: string[] = [];
  const err = (m: string) => errors.push(m);

  const artist = await loadArtist(artistId);
  const memberIds = new Set(artist.members.map((m) => m.id));
  const eraIds = new Set(artist.eras.map((e) => e.id));
  const unitIds = new Set(artist.units.map((u) => u.id));

  if (artist.defaultEra && !eraIds.has(artist.defaultEra)) err(`artist.json: defaultEra "${artist.defaultEra}" が eras にない`);
  if (artist.defaultUnit && !unitIds.has(artist.defaultUnit)) err(`artist.json: defaultUnit "${artist.defaultUnit}" が units にない`);

  // songs
  const songs = await loadSongs(artistId);
  const seenIds = new Set<string>();
  const seenTitles = new Map<string, string>();
  for (const s of songs) {
    if (seenIds.has(s.id)) err(`songs.json: id 重複 ${s.id}`);
    seenIds.add(s.id);
    for (const t of [s.title, ...s.aliases]) {
      const key = normalizeTitle(t);
      const other = seenTitles.get(key);
      if (other && other !== s.id) err(`songs.json: 曲名/別名「${t}」が ${other} と ${s.id} で重複`);
      seenTitles.set(key, s.id);
    }
    if (s.era && !eraIds.has(s.era)) err(`songs.json: ${s.id} の era "${s.era}" が artist.json にない`);
    if (s.unit && !unitIds.has(s.unit)) err(`songs.json: ${s.id} の unit "${s.unit}" が artist.json にない`);
  }

  // events + overrides
  const overrides = await loadOverrides(artistId);
  const rawEvents = await loadEvents(artistId);
  const known = new Set([...rawEvents.map((e) => e.id), ...overrides.extraEvents.map((e) => e.id)]);
  for (const id of Object.keys(overrides.events)) {
    if (!known.has(Number(id))) warns.push(`overrides.json: event ${id} が events.json にない`);
    for (const m of overrides.events[id]!.members ?? []) if (!memberIds.has(m)) err(`overrides.json: ${id} の member "${m}" が不明`);
  }
  const costumeIds = new Set(artist.costumes.map((c) => c.id));
  for (const [id, ov] of Object.entries(overrides.events)) {
    if (ov.costume && !costumeIds.has(ov.costume)) err(`overrides.json: ${id} の costume "${ov.costume}" が artist.json の costumes にない`);
  }
  const events = resolveEvents(rawEvents, overrides, artist);
  const eventById = new Map(events.map((e) => [e.id, e]));

  // setlists
  const withSetlist = new Set<number>();
  // 出典（source）は任意項目。無いものは情報として数えるだけ
  const noSource: string[] = [];
  for (const f of await loadSetlistFiles(artistId)) {
    const parsed = Setlist.safeParse(f.raw);
    if (!parsed.success) {
      err(`setlists/${f.file}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const sl = parsed.data;
    withSetlist.add(sl.event);
    if (!sl.source) noSource.push(f.file);
    if (f.file.replace(/\.ya?ml$/, "") !== String(sl.event)) err(`setlists/${f.file}: ファイル名と event (${sl.event}) が一致しない`);
    const ev = eventById.get(sl.event);
    if (!ev) err(`setlists/${f.file}: event ${sl.event} が見つからない（events.json / overrides / since を確認）`);
    else if (!isLiveEvent(ev)) warns.push(`setlists/${f.file}: 特典会のみのイベントにセトリがある`);

    for (const [si, stage] of setlistStages(sl).entries()) {
      for (const m of stage.members ?? []) if (!memberIds.has(m)) err(`setlists/${f.file}: stage ${si} の member "${m}" が不明`);
      for (const item of stage.items) {
        const title = typeof item === "string" ? item : item.song;
        const song = findSong(songs, { label: title, title });
        if (!song) err(`setlists/${f.file}: 曲「${title}」が songs.json にない`);
        else if (song.title !== title) warns.push(`setlists/${f.file}: 「${title}」は正式表記「${song.title}」に揃えると良い`);
        if (typeof item !== "string") {
          for (const m of item.members ?? []) if (!memberIds.has(m)) err(`setlists/${f.file}: 「${title}」の member "${m}" が不明`);
        }
      }
    }
  }

  // 未入力の終了済みイベント（情報のみ）
  const today = jstDateDaysAgo(0);
  const missing = events.filter((e) => e.date < today && isLiveEvent(e) && !withSetlist.has(e.id));

  for (const w of warns) console.warn(`[${artistId}] warning: ${w}`);
  for (const e of errors) console.error(`[${artistId}] error: ${e}`);
  console.log(
    `[${artistId}] songs ${songs.length}, events ${events.length}, setlists ${withSetlist.size}, ` +
      `未入力の終了済みイベント ${missing.length}, 出典なしのセトリ ${noSource.length}` +
      (errors.length ? ` — ${errors.length} error(s)` : " — OK"),
  );
  if (showMissing) {
    for (const e of missing) console.log(`  未入力 ${e.date} ${String(e.id).padStart(6)} ${e.types.join("+").padEnd(14)} ${e.title}`);
    for (const f of noSource) console.log(`  出典なし setlists/${f}`);
  }
  return errors.length;
}

/**
 *   pnpm lm validate <artistId|all> [--missing]
 */
export async function validate(target: string, opts: Record<string, unknown>) {
  const ids =
    target === "all"
      ? (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
      : [target];
  let errors = 0;
  for (const id of ids) errors += await validateOne(id, !!opts.missing);
  if (errors) process.exitCode = 1;
}
