// plugins/artists-data.ts が提供する仮想モジュール

declare module "virtual:lovely-memory/artists" {
  import type { ArtistConfig, Event, Overrides, Setlist, Song } from "@lovely-memory/core/runtime";

  export type RawArtistData = { songs: Song[]; events: Event[]; overrides: Overrides; setlists: Setlist[] };
  export const artists: ArtistConfig[];
  export const loaders: Record<string, () => Promise<{ default: RawArtistData }>>;
}

/** どのビルドか（デプロイ時はコミットの先頭 7 文字。vite.config.ts の define） */
declare const __BUILD__: string;
