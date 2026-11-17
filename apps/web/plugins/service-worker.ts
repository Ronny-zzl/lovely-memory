import { createHash } from "node:crypto";
import type { Plugin } from "vite";

/** public/ のうち、オフラインでも使うもの */
const STATIC_FILES = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-180.png"];

/**
 * オフライン対応の Service Worker（sw.js）をビルド時に書き出す。
 * - ページ（HTML）: ネットワーク優先。つながらなければキャッシュ、無ければアプリ本体（/）を返して SPA で描画
 * - /assets/（ファイル名にハッシュ入り＝内容が変わらない）: キャッシュ優先。ビルド時の全ファイルを事前キャッシュ
 * - その他の同一オリジン GET: ネットワーク優先、失敗時キャッシュ
 * バージョン（ファイル一覧のハッシュ）ごとにキャッシュを分け、有効化した順に最新 2 世代だけ残す
 * （デプロイ直後に古いページが古いチャンクを読みに来ても困らないように）。
 */
export function serviceWorker(): Plugin {
  return {
    name: "lovely-memory:service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => f.startsWith("assets/"))
        .map((f) => `/${f}`)
        .sort();
      const precache = [...STATIC_FILES, ...assets];
      const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
      this.emitFile({ type: "asset", fileName: "sw.js", source: swSource(version, precache) });
    },
  };
}

function swSource(version: string, precache: string[]): string {
  return `// ビルド時に生成（apps/web/plugins/service-worker.ts）
const VERSION = ${JSON.stringify(version)};
const PREFIX = "lovely-memory-";
const CACHE = PREFIX + VERSION;
// 有効化した順のバージョン一覧を保存する（キャッシュ名だけでは新旧が分からないため）
const META = PREFIX + "meta";
const PRECACHE = ${JSON.stringify(precache)};
const KEEP = 2;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const meta = await caches.open(META);
      const saved = await meta.match("/versions");
      const versions = (saved ? await saved.json() : []).filter((v) => v !== VERSION);
      versions.push(VERSION);
      const keep = versions.slice(-KEEP);
      await meta.put("/versions", new Response(JSON.stringify(keep)));
      const keepNames = new Set([META, ...keep.map((v) => PREFIX + v)]);
      const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX) && !keepNames.has(n));
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function fromCache(request) {
  // 今のバージョンを先に探す
  const others = (await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== CACHE && n !== META);
  for (const name of [CACHE, ...others]) {
    // crossorigin 付きの <script>/<link> は Origin ヘッダー付きで来るので、Vary: Origin で外れないようにする
    const hit = await (await caches.open(name)).match(request, { ignoreSearch: request.mode === "navigate", ignoreVary: true });
    if (hit) return hit;
  }
  return undefined;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return response;
  } catch (e) {
    const cached = (await fromCache(request)) ?? (fallbackUrl && (await fromCache(fallbackUrl)));
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request) {
  const cached = await fromCache(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API（eventernote の読み込みなど）はその都度サーバーへ。キャッシュもしない
  if (url.pathname.startsWith("/api/")) return;
  // 共有カードの画像はページ表示に使わないのでキャッシュしない
  if (url.pathname.startsWith("/og/") || url.pathname === "/og.png") return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
`;
}
