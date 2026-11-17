/*
 * 冒烟测试：ビルド結果（dist）を vite preview で配信し、Chrome で全ページを開いて
 * 「表示される・エラーが出ない」ことを確かめる。依存関係の自動更新（Renovate）で画面が壊れていないかの確認用。
 *
 *   pnpm build && pnpm smoke
 *
 * Chrome はローカルの Google Chrome（GitHub Actions の ubuntu-latest にも入っている）。CHROME_PATH で上書き可。
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { preview } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await preview({ root, logLevel: "error", preview: { port: 0, strictPort: false, open: false } });
const base = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
if (!base) throw new Error("preview server did not start");

const executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(executablePath && existsSync(executablePath) ? { executablePath } : { channel: "chrome" });
const failures: string[] = [];
let checked = 0;

/** ページを開き、selector が出るまで待つ。JS エラー・コンソールエラー・読み込み失敗を記録する */
async function visit(page: Page, path: string, selector: string, check?: (page: Page) => Promise<string | undefined>) {
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(`pageerror: ${e.message}`);
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  };
  const onResponse = (r: { status(): number; url(): string }) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  page.on("response", onResponse);
  try {
    await page.goto(base + path, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(selector, { timeout: 10_000 });
    const problem = await check?.(page);
    if (problem) errors.push(problem);
  } catch (e) {
    errors.push(e instanceof Error ? e.message.split("\n")[0]! : String(e));
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
    page.off("response", onResponse);
  }
  checked++;
  if (errors.length) failures.push(`${path}\n    ${errors.join("\n    ")}`);
}

const hrefs = (page: Page, selector: string) =>
  page.$$eval(selector, (as) => [...new Set(as.map((a) => new URL((a as HTMLAnchorElement).href).pathname))]);

try {
  const page = await browser.newPage();

  await visit(page, "/", ".artist-list");

  // ホーム画面用アイコン：manifest と apple-touch-icon の画像が、宣言どおりの大きさで読み込めること
  const icons: Array<{ src: string; sizes: string }> = await page.evaluate(async () => {
    const manifest = await (await fetch("/manifest.webmanifest")).json();
    const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    return [...manifest.icons, ...(apple ? [{ src: new URL(apple.href).pathname, sizes: "180x180" }] : [])];
  });
  for (const icon of icons) {
    const size = await page.evaluate(
      (src) =>
        new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(`${img.naturalWidth}x${img.naturalHeight}`);
          img.onerror = () => resolve("読み込み失敗");
          img.src = src;
        }),
      icon.src,
    );
    checked++;
    if (size !== icon.sizes) failures.push(`${icon.src}: ${icon.sizes} のはずが ${size}`);
  }
  const artists = await hrefs(page, ".artist-list a");
  if (artists.length === 0) failures.push("/: アーティストが 1 件も表示されていない");

  for (const artist of artists) {
    // 未披露の曲も含めて全曲のリンクを集める
    await visit(page, `${artist}/songs?unplayed=1`, ".stats-table tbody tr", async (p) =>
      (await p.locator(".stats-table tbody tr").count()) > 0 ? undefined : "曲の行が無い",
    );
    const songs = await hrefs(page, "a.song-title");
    // 開催予定は折りたたまれているので、表示されている公演の行を待つ
    await visit(page, `${artist}/events`, "a.event-row:visible");
    const events = await hrefs(page, ".event-list a.event-row");
    await visit(page, `${artist}/trends`, ".trend-grid");
    await visit(page, `${artist}/members`, ".member-cards li");

    for (const path of songs) await visit(page, path, ".song-detail-title");
    for (const path of events) await visit(page, path, ".event-detail-title");
    if (songs.length === 0) failures.push(`${artist}/songs: 曲へのリンクが無い`);
    if (events.length === 0) failures.push(`${artist}/events: 公演へのリンクが無い`);

    // 以前の hash ルーティングのリンクが通常のパスに置き換わること
    if (songs[0]) {
      await visit(page, `/#${songs[0]}`, ".song-detail-title", async (p) =>
        new URL(p.url()).pathname === songs[0] ? undefined : `hash リンクが ${songs[0]} に置き換わらない（${p.url()}）`,
      );
    }
  }

  // オフライン：一度開いて Service Worker が有効になった後、ネットワークを切っても
  // まだ開いていないページを含めて表示できること
  const offline = await browser.newContext();
  try {
    const p = await offline.newPage();
    await p.goto(base + "/", { waitUntil: "load" });
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const artist = (await hrefs(p, ".artist-list a"))[0];
    await offline.setOffline(true);
    if (artist) {
      for (const [path, selector] of [
        [`${artist}/trends`, ".trend-grid"],
        [`${artist}/songs`, ".stats-table tbody tr"],
        [`${artist}/members`, ".member-cards li"],
      ] as const) {
        const before = failures.length;
        await visit(p, path, selector);
        if (failures.length > before) failures[failures.length - 1] = `[オフライン] ${failures.at(-1)}`;
      }
    }
  } finally {
    await offline.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}

if (failures.length) {
  console.error(`smoke: ${failures.length}/${checked} ページで問題\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`smoke: ${checked} ページ OK`);
