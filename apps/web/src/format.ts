import type { EventType } from "@lovely-memory/core";

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  oneman: "単独公演",
  taiban: "主催対バン",
  external: "対バン・フェス",
  release: "リリイベ",
  free: "フリーライブ",
  tokuten: "特典会",
};

/** セトリが存在しうる種別（tokuten はライブが無いので除外） */
export const LIVE_EVENT_TYPES: EventType[] = ["oneman", "taiban", "external", "release", "free"];

export const formatDate = (iso: string) => iso.replaceAll("-", ".");

export const formatPercent = (r: number) => `${Math.round(r * 100)}%`;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-11-08" → "11.08 (日)" */
export function formatDayWithWeekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")} (${wd})`;
}

/** イベント名の先頭に付いているグループ名を省く（一覧を短くするため） */
export function displayTitle(title: string, artistName: string): string {
  const t = title.startsWith(artistName) ? title.slice(artistName.length).replace(/^[\s　/／:：-]+/, "") : title;
  return t || title;
}

export const eventernoteUrl = (eventId: number) =>
  eventId > 0 ? `https://www.eventernote.com/events/${eventId}` : undefined;
