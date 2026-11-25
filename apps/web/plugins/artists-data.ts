import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import YAML from "yaml";
import { ArtistConfig, EventList, Overrides, Setlist, SongList } from "@lovely-memory/core";

/**
 * artists/<id>/ のデータをビルド時に読み込み、zod で検証・既定値を補った JSON として提供する。
 *
 * - `virtual:lovely-memory/artists` … 全アーティストの artist.json と、各アーティストのデータの遅延ローダ
 * - `virtual:lovely-memory/artist/<id>` … 1 アーティスト分のデータ（1 チャンクにまとまる）
 *
 * 検証をビルド時に済ませるので、ブラウザに zod を載せずに済む。データに誤りがあればビルドが失敗する。
 */
const ARTISTS_DIR = resolve(fileURLToPath(import.meta.url), "../../../../artists");
const INDEX_ID = "virtual:lovely-memory/artists";
const ARTIST_PREFIX = "virtual:lovely-memory/artist/";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** zod のエラーにファイル名を付けて投げ直す */
function parseFile<T>(path: string, parse: (raw: unknown) => T, raw: unknown): T {
  try {
    return parse(raw);
  } catch (e) {
    throw new Error(`${path.slice(path.indexOf("artists/"))}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function artistsData(): Plugin {
  return {
    name: "lovely-memory:artists-data",

    // 開発サーバー: artists/ 以下の変更（セトリの追加を含む）で仮想モジュールを作り直し、ページを再読み込みする
    configureServer(server) {
      server.watcher.add(ARTISTS_DIR);
      server.watcher.on("all", (_event, path) => {
        if (!path.startsWith(ARTISTS_DIR)) return;
        for (const mod of server.moduleGraph.idToModuleMap.values()) {
          if (mod.id?.startsWith("\0virtual:lovely-memory/")) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: "full-reload" });
      });
    },

    resolveId(id) {
      if (id === INDEX_ID || id.startsWith(ARTIST_PREFIX)) return `\0${id}`;
    },

    load(id) {
      if (id === `\0${INDEX_ID}`) {
        const ids = readdirSync(ARTISTS_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory() && existsSync(join(ARTISTS_DIR, d.name, "artist.json")))
          .map((d) => d.name)
          .sort();
        // 下書きのアーティスト（artist.json の draft）は、INCLUDE_DRAFTS=1 のとき（確認用のプレビュー）だけ含める。
        // 公開サイトのビルドには、ページもデータも入らない
        const includeDrafts = process.env.INCLUDE_DRAFTS === "1";
        const configs = ids
          .map((artistId) => {
            const path = join(ARTISTS_DIR, artistId, "artist.json");
            return parseFile(path, (r) => ArtistConfig.parse(r), readJson(path));
          })
          .filter((c) => includeDrafts || !c.draft)
          // 下書きは公開中のアーティストの後ろに（トップの並び。smoke テストも先頭の公開中のアーティストで見て回る）
          .sort((a, b) => Number(!!a.draft) - Number(!!b.draft));
        const loaders = configs.map((c) => `${JSON.stringify(c.id)}: () => import(${JSON.stringify(ARTIST_PREFIX + c.id)})`);
        return `export const artists = ${JSON.stringify(configs)};\nexport const loaders = {${loaders.join(",")}};\n`;
      }

      if (id.startsWith(`\0${ARTIST_PREFIX}`)) {
        const artistId = id.slice(`\0${ARTIST_PREFIX}`.length);
        const dir = join(ARTISTS_DIR, artistId);
        const optional = <T>(file: string, parse: (raw: unknown) => T, fallback: unknown): T => {
          const path = join(dir, file);
          return parseFile(path, parse, existsSync(path) ? readJson(path) : fallback);
        };
        const songs = optional("songs.json", (r) => SongList.parse(r), []);
        const events = optional("events.json", (r) => EventList.parse(r), []);
        const overrides = optional("overrides.json", (r) => Overrides.parse(r), {});

        const setlistDir = join(dir, "setlists");
        const setlists = existsSync(setlistDir)
          ? readdirSync(setlistDir)
              .filter((f) => /\.ya?ml$/.test(f))
              .sort()
              .map((f) => {
                const path = join(setlistDir, f);
                return parseFile(path, (r) => Setlist.parse(r), YAML.parse(readFileSync(path, "utf8")));
              })
          : [];
        return `export default ${JSON.stringify({ songs, events, overrides, setlists })};\n`;
      }
    },
  };
}
