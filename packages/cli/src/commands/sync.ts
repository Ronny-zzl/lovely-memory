import { readdir } from "node:fs/promises";
import type { Event } from "@lovely-memory/core";
import { fetchActorEvents } from "@lovely-memory/eventernote";
import { ARTISTS_DIR, artistPath, loadArtist, loadEvents, USER_AGENT, writeJson } from "../repo";

/** 開催日からこの日数を過ぎたイベントは確定扱いとし、再取得しない */
const DEFAULT_FROZEN_DAYS = 30;

/** Asia/Tokyo での今日から days 日前（YYYY-MM-DD） */
export function jstDateDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(d);
}

function diff(before: Event[], after: Event[]) {
  const b = new Map(before.map((e) => [e.id, JSON.stringify(e)]));
  const a = new Map(after.map((e) => [e.id, JSON.stringify(e)]));
  const added = after.filter((e) => !b.has(e.id));
  const removed = before.filter((e) => !a.has(e.id));
  const changed = after.filter((e) => b.has(e.id) && b.get(e.id) !== a.get(e.id));
  return { added, removed, changed };
}

type SyncOptions = { dryRun: boolean; full: boolean; frozenDays: number };

async function syncOne(artistId: string, opts: SyncOptions) {
  const artist = await loadArtist(artistId);
  const en = artist.sources.eventernote;
  if (!en) {
    console.log(`[${artistId}] sources.eventernote がないのでスキップ`);
    return;
  }

  const before = await loadEvents(artistId);
  // 既存データが無い・--full 指定時は since まで全件。それ以外は確定済み（frozenDays より前）を再取得しない
  const full = opts.full || before.length === 0;
  const recent = jstDateDaysAgo(opts.frozenDays);
  const cutoff = full ? artist.since : artist.since && artist.since > recent ? artist.since : recent;

  const fetched = await fetchActorEvents(en.actorId, {
    since: cutoff,
    userAgent: USER_AGENT,
    log: (m) => process.stderr.write(`[${artistId}] ${m}\n`),
  });
  const frozen = cutoff ? before.filter((e) => e.date < cutoff) : [];
  const events = [...frozen, ...fetched]
    .filter((e) => !artist.until || e.date <= artist.until)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const d = diff(before, events);
  for (const e of d.added) console.log(`[${artistId}] + ${e.date} ${e.id} ${e.title}`);
  for (const e of d.removed) console.log(`[${artistId}] - ${e.date} ${e.id} ${e.title}`);
  for (const e of d.changed) console.log(`[${artistId}] ~ ${e.date} ${e.id} ${e.title}`);
  console.log(
    `[${artistId}] ${full ? "full" : `since ${cutoff}`}: ${events.length} events ` +
      `(added ${d.added.length}, removed ${d.removed.length}, changed ${d.changed.length})`,
  );

  if (!opts.dryRun) await writeJson(artistPath(artistId, "events.json"), events);
}

/**
 *   pnpm lm sync <artistId|all> [--full] [--frozen-days 30] [--dry-run]
 */
export async function sync(target: string, opts: Record<string, unknown>) {
  const frozenDays = typeof opts["frozen-days"] === "string" ? Number(opts["frozen-days"]) : DEFAULT_FROZEN_DAYS;
  if (!Number.isInteger(frozenDays) || frozenDays < 0) throw new Error("--frozen-days は 0 以上の整数");
  const syncOpts = { dryRun: !!opts["dry-run"], full: !!opts.full, frozenDays };

  const ids =
    target === "all"
      ? (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
      : [target];
  for (const id of ids) await syncOne(id, syncOpts);
}
