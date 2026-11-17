import { readdir } from "node:fs/promises";
import type { Event } from "@lovely-memory/core";
import { fetchActorEvents } from "@lovely-memory/eventernote";
import { ARTISTS_DIR, artistPath, loadArtist, loadEvents, USER_AGENT, writeJson } from "../repo";

function diff(before: Event[], after: Event[]) {
  const b = new Map(before.map((e) => [e.id, JSON.stringify(e)]));
  const a = new Map(after.map((e) => [e.id, JSON.stringify(e)]));
  const added = after.filter((e) => !b.has(e.id));
  const removed = before.filter((e) => !a.has(e.id));
  const changed = after.filter((e) => b.has(e.id) && b.get(e.id) !== a.get(e.id));
  return { added, removed, changed };
}

async function syncOne(artistId: string, dryRun: boolean) {
  const artist = await loadArtist(artistId);
  const en = artist.sources.eventernote;
  if (!en) {
    console.log(`[${artistId}] sources.eventernote がないのでスキップ`);
    return;
  }

  // 一覧は新しい順なので、since まで遡れば十分。毎回全件取り直すことで eventernote 側の修正・削除も反映される
  const fetched = await fetchActorEvents(en.actorId, {
    since: artist.since,
    userAgent: USER_AGENT,
    log: (m) => process.stderr.write(`[${artistId}] ${m}\n`),
  });
  const events = fetched
    .filter((e) => !artist.until || e.date <= artist.until)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const before = await loadEvents(artistId);
  const d = diff(before, events);
  for (const e of d.added) console.log(`[${artistId}] + ${e.date} ${e.id} ${e.title}`);
  for (const e of d.removed) console.log(`[${artistId}] - ${e.date} ${e.id} ${e.title}`);
  for (const e of d.changed) console.log(`[${artistId}] ~ ${e.date} ${e.id} ${e.title}`);
  console.log(
    `[${artistId}] ${events.length} events (added ${d.added.length}, removed ${d.removed.length}, changed ${d.changed.length})`,
  );

  if (!dryRun) await writeJson(artistPath(artistId, "events.json"), events);
}

/**
 *   pnpm lm sync <artistId|all> [--dry-run]
 */
export async function sync(target: string, opts: Record<string, unknown>) {
  const dryRun = !!opts["dry-run"];
  const ids =
    target === "all"
      ? (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
      : [target];
  for (const id of ids) await syncOne(id, dryRun);
}
