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
