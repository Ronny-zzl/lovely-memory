import { taiyotsukiyo } from "./taiyotsukiyo";
import type { DiscographyAdapter } from "./types";

/** artist.json の sources.official.adapter で指定する名前 → 実装 */
export const adapters: Record<string, DiscographyAdapter> = {
  taiyotsukiyo,
};

export type { DiscographyAdapter, OfficialTrack, FetchHtml } from "./types";
