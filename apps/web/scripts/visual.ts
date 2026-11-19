/*
 * 見た目の比較（CSS の整理など、見た目を変えないはずの変更の確認用）。
 * ビルド結果（dist）の主なページを、ライト／ダーク × スマホ／PC で全体のスクリーンショットに撮り、前後で 1 ピクセルずつ比べる。
 *
 *   pnpm build && pnpm visual shoot <dir>         # 撮る
 *   pnpm visual compare <before> <after> [<diff>]  # 比べる（違いのあった画像は <diff> に差分を書き出す）
 *
 * 日時は固定（誕生日までの日数などで画面が変わらないように）。データが変わると画面も変わるので、
 * 比べるのは同じデータで撮ったもの同士にする（リポジトリには保存しない）。
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { preview } from "vite";

const ARTIST = "taiyotsukiyo-2nd";
const NOW = new Date("2026-11-18T21:00:00+09:00");
/** 参戦記録のページ用（参戦済み 3 件・参戦予定 1 件） */
const ATTENDANCE = { manual: { 491702: true, 492324: true, 499149: true, 497664: true } };

const PAGES: Array<{ name: string; path: string; attendance?: boolean }> = [
  { name: "home", path: "/" },
  { name: "songs", path: `/${ARTIST}/songs` },
  { name: "song-tieup", path: `/${ARTIST}/songs/s015` },
  { name: "song-cover", path: `/${ARTIST}/songs/s044` },
  { name: "events", path: `/${ARTIST}/events`, attendance: true },
  { name: "event-setlist", path: `/${ARTIST}/events/492324`, attendance: true },
  { name: "event-special-costume", path: `/${ARTIST}/events/491702` },
  { name: "event-upcoming", path: `/${ARTIST}/events/497664` },
  { name: "trends", path: `/${ARTIST}/trends` },
  { name: "members", path: `/${ARTIST}/members` },
  { name: "attendance-empty", path: `/${ARTIST}/attendance` },
  { name: "attendance", path: `/${ARTIST}/attendance`, attendance: true },
];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
] as const;
const SCHEMES = ["light", "dark"] as const;

async function shoot(dir: string) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const server = await preview({ root, logLevel: "error", preview: { port: 0, strictPort: false, open: false } });
  const base = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
  if (!base) throw new Error("preview server did not start");
  const executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(executablePath && existsSync(executablePath) ? { executablePath } : { channel: "chrome" });
  await mkdir(dir, { recursive: true });
  let n = 0;
  try {
    for (const vp of VIEWPORTS) {
      for (const scheme of SCHEMES) {
        for (const p of PAGES) {
          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            colorScheme: scheme,
            // ページを開いたときのふわっとした表示などの動きを止めて、撮るたびに同じ絵になるように（styles/motion.css）
            reducedMotion: "reduce",
            serviceWorkers: "block",
          });
          const page = await context.newPage();
          await page.clock.setFixedTime(NOW);
          if (p.attendance) {
            await page.addInitScript((data) => localStorage.setItem("lovely-memory:attendance:v1", data), JSON.stringify(ATTENDANCE));
          }
          await page.goto(base + p.path, { waitUntil: "networkidle" });
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: join(dir, `${p.name}.${vp.name}.${scheme}.png`), fullPage: true, animations: "disabled" });
          await context.close();
          n++;
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(`visual: ${n} 枚 → ${dir}`);
}

async function compare(a: string, b: string, diffDir?: string) {
  const files = (await readdir(a)).filter((f) => f.endsWith(".png")).sort();
  const changed: string[] = [];
  if (diffDir) await mkdir(diffDir, { recursive: true });
  for (const f of files) {
    if (!existsSync(join(b, f))) {
      changed.push(`${f}: 後の方に無い`);
      continue;
    }
    const x = PNG.sync.read(await readFile(join(a, f)));
    const y = PNG.sync.read(await readFile(join(b, f)));
    if (x.width !== y.width || x.height !== y.height) {
      changed.push(`${f}: 大きさが違う ${x.width}x${x.height} → ${y.width}x${y.height}`);
      continue;
    }
    const diff = new PNG({ width: x.width, height: x.height });
    // 細いグラデーションや丸の縁は、描くたびに色が 1〜2 段ずれることがある（ディザ・アンチエイリアス）ので、ごく小さな差は数えない
    const pixels = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0.03 });
    if (pixels > 0) {
      changed.push(`${f}: ${pixels} ピクセル`);
      if (diffDir) await writeFile(join(diffDir, f), PNG.sync.write(diff));
    }
  }
  console.log(`visual: ${files.length} 枚中 ${changed.length} 枚に違い`);
  for (const c of changed) console.log(`  ${c}`);
  if (changed.length) process.exitCode = 1;
}

const [mode, ...args] = process.argv.slice(2);
if (mode === "shoot" && args[0]) await shoot(resolve(args[0]));
else if (mode === "compare" && args[0] && args[1]) await compare(resolve(args[0]), resolve(args[1]), args[2] && resolve(args[2]));
else {
  console.error("usage: visual shoot <dir> | visual compare <before> <after> [<diff>]");
  process.exitCode = 2;
}
