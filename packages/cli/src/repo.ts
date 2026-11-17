import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ArtistConfig, Overrides, SongList, EventList, type Song } from "@lovely-memory/core";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const ARTISTS_DIR = join(REPO_ROOT, "artists");

/** 外部サービスへのリクエストに使う User-Agent（個人情報は含めない） */
export const USER_AGENT = "Mozilla/5.0 (compatible; lovely-memory-bot/0.1; setlist statistics)";

export function artistPath(artistId: string, ...rest: string[]): string {
  return join(ARTISTS_DIR, artistId, ...rest);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/** 空配列・undefined を落として 2 スペースで書き出す（差分を小さく保つ） */
export async function writeJson(path: string, data: unknown): Promise<void> {
  const text = JSON.stringify(
    data,
    (_k, v) => (Array.isArray(v) && v.length === 0 ? undefined : v),
    2,
  );
  await writeFile(path, text + "\n", "utf8");
}

export async function loadArtist(artistId: string): Promise<ArtistConfig> {
  const path = artistPath(artistId, "artist.json");
  if (!existsSync(path)) throw new Error(`artist not found: ${artistId} (${path})`);
  return ArtistConfig.parse(await readJson(path));
}

export async function loadSongs(artistId: string): Promise<Song[]> {
  const path = artistPath(artistId, "songs.json");
  return existsSync(path) ? SongList.parse(await readJson(path)) : [];
}

export async function loadEvents(artistId: string) {
  const path = artistPath(artistId, "events.json");
  return existsSync(path) ? EventList.parse(await readJson(path)) : [];
}

export async function loadOverrides(artistId: string) {
  const path = artistPath(artistId, "overrides.json");
  return existsSync(path) ? Overrides.parse(await readJson(path)) : Overrides.parse({});
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
