import { resolveEvents } from "@lovely-memory/core";
import { loadArtist, loadEvents, loadOverrides } from "../repo.ts";

/**
 * overrides とルールを適用した後のイベント一覧を表示する（種別判定の確認用）。
 *
 *   pnpm lm list-events <artistId> [--type <eventType>]
 */
export async function listEvents(artistId: string, opts: Record<string, unknown>) {
  const artist = await loadArtist(artistId);
  const events = resolveEvents(await loadEvents(artistId), await loadOverrides(artistId), artist);
  const filtered = typeof opts.type === "string" ? events.filter((e) => e.type === opts.type) : events;

  const counts = new Map<string, number>();
  for (const e of filtered) {
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    const members =
      e.membersSource === "assumed" ? "(全員?)" : e.members.length === artist.members.length ? "全員" : e.members.join(",");
    console.log(`${e.date} ${e.start ?? "--:--"} ${e.type.padEnd(8)} ${String(e.id).padStart(6)}  ${e.title}  [${members}]`);
  }
  console.log(`\n${filtered.length} events: ${[...counts].map(([t, n]) => `${t}=${n}`).join(" ")}`);
}
