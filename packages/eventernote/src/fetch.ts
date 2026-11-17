import type { Event } from "@lovely-memory/core";
import { parseEventList } from "./parse.ts";

export const BASE_URL = "https://www.eventernote.com";

export type FetchOptions = {
  /** この日付より前のイベントが出てきたら打ち切る（一覧は新しい順） */
  since?: string;
  /** User-Agent。素の "Mozilla/5.0" は 403 になるので説明的なものを渡すこと */
  userAgent: string;
  /** リクエスト間隔（ミリ秒）。サーバー負荷に配慮して既定 3000 */
  intervalMs?: number;
  /** 安全のための最大ページ数 */
  maxPages?: number;
  log?: (msg: string) => void;
};

export function actorEventsUrl(actorId: number, page: number): string {
  return `${BASE_URL}/actors/${actorId}/events?actor_id=${actorId}&limit=20&page=${page}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** アクターの出演イベントを新しい順に取得し、since 以降のものを返す */
export async function fetchActorEvents(actorId: number, opts: FetchOptions): Promise<Event[]> {
  const interval = opts.intervalMs ?? 3000;
  const maxPages = opts.maxPages ?? 50;
  const result: Event[] = [];

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(interval);
    const url = actorEventsUrl(actorId, page);
    opts.log?.(`GET ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": opts.userAgent, "Accept-Language": "ja" } });
    if (!res.ok) throw new Error(`eventernote ${res.status}: ${url}`);
    const { events, hasNext } = parseEventList(await res.text());

    const inRange = opts.since ? events.filter((e) => e.date >= opts.since!) : events;
    result.push(...inRange);
    const reachedSince = opts.since && events.some((e) => e.date < opts.since!);
    if (!hasNext || reachedSince || events.length === 0) break;
  }
  return result;
}
