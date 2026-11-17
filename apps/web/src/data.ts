import { ArtistConfig } from "@lovely-memory/core";

// artists/<id>/artist.json をビルド時にすべて取り込む。アーティスト追加はディレクトリを足すだけ。
const configs = import.meta.glob("../../../artists/*/artist.json", { eager: true, import: "default" });

export const artists: ArtistConfig[] = Object.values(configs)
  .map((raw) => ArtistConfig.parse(raw))
  .sort((a, b) => a.id.localeCompare(b.id));
