// plugins/artists-data.ts が提供する仮想モジュール

declare module "virtual:lovely-memory/artists" {
  import type { ArtistConfig, Event, Overrides, Setlist, Song } from "@lovely-memory/core/runtime";

  export type RawArtistData = { songs: Song[]; events: Event[]; overrides: Overrides; setlists: Setlist[] };
  export const artists: ArtistConfig[];
  export const loaders: Record<string, () => Promise<{ default: RawArtistData }>>;
}

/** どのビルドか（デプロイ時はコミットの先頭 7 文字。vite.config.ts の define） */
declare const __BUILD__: string;

/** ビルドした日（JST の YYYY-MM-DD。vite.config.ts の define） */
declare const __BUILD_TODAY__: string;

/** サイトの URL の origin（末尾の / なし。vite.config.ts の define） */
declare const __SITE_ORIGIN__: string;
