import type { Setlist, SetlistItem, SetlistStage } from "./schema.ts";

/** items / stages の書き分けを吸収して常にステージ配列で返す */
export function setlistStages(s: Setlist): SetlistStage[] {
  return s.stages ?? [{ items: s.items ?? [] }];
}

export function itemSong(item: SetlistItem): string {
  return typeof item === "string" ? item : item.song;
}

/** 曲名を思い出せない曲（セトリの中の位置だけ分かっている）。曲としては数えない */
export const UNKNOWN_SONG = "?";
