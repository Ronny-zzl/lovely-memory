import { taiyotsukiyo } from "./taiyotsukiyo.ts";
import type { DiscographyAdapter } from "./types.ts";

/** artist.json の sources.official.adapter で指定する名前 → 実装 */
export const adapters: Record<string, DiscographyAdapter> = {
  taiyotsukiyo,
};

export type { DiscographyAdapter, OfficialTrack, FetchHtml } from "./types.ts";
