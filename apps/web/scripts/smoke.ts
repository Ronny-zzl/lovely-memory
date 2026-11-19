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
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { preview } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await preview({ root, logLevel: "error", preview: { port: 0, strictPort: false, open: false } });
const base = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
if (!base) throw new Error("preview server did not start");

const executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(executablePath && existsSync(executablePath) ? { executablePath } : { channel: "chrome" });
const failures: string[] = [];
let checked = 0;

/**
 * ブラウザからのエラーの報告（/api/errors）を受け止めて記録する。サーバーには送らない。
 * 報告の中身（どのページの何のエラーか）が分かるように、本文を読んでおく（sendBeacon の本文は request イベントでは読めない）
 */
type Report = { path: string; error: string };

async function catchReports(context: BrowserContext): Promise<Report[]> {
  const reports: Report[] = [];
  await context.route("**/api/errors", async (route) => {
    const raw = route.request().postData() ?? "";
    try {
      const r = JSON.parse(raw) as { kind?: string; message?: string; path?: string };
      reports.push({ path: r.path ?? "?", error: `[${r.kind ?? "?"}] ${(r.message ?? "").split("\n")[0]!.slice(0, 160)}` });
    } catch {
      reports.push({ path: "?", error: raw || "（本文なし）" });
    }
    await route.fulfill({ status: 204 });
  });
  return reports;
}

/** React の本番ビルドのエラー番号のうち、引き継ぎ（hydrate）の食い違いを表すもの */
const HYDRATION_ERRORS = /Minified React error #(418|419|422|423|425)\b/;

/**
 * go（ページを開く・リンクを押すなど）の後、url（あれば）と selector が出るまで待つ。JS エラー・コンソールエラー・読み込み失敗を記録する
 */
async function step(
  page: Page,
  label: string,
  go: () => Promise<unknown>,
  selector: string,
  opts: { url?: RegExp; check?: (page: Page) => Promise<string | undefined> } = {},
) {
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(`pageerror: ${e.message}`);
  const onConsole = (m: { type(): string; text(): string; location(): { url: string } }) => {
    // フォントは使う分だけ後から読むので、オフラインでは読めないことがある（システムのフォントで表示される）。
    // オンラインで本当に見つからない場合は下の HTTP の確認で分かる
    if (m.type() === "error" && !/\.woff2?$/.test(m.location().url)) errors.push(`console: ${m.text()}`);
  };
  const onResponse = (r: { status(): number; url(): string }) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  page.on("response", onResponse);
  try {
    await go();
    if (opts.url) await page.waitForURL(opts.url, { timeout: 10_000 });
    await page.waitForSelector(selector, { timeout: 10_000 });
    const problem = await opts.check?.(page);
    if (problem) errors.push(problem);
  } catch (e) {
    errors.push(e instanceof Error ? e.message.split("\n")[0]! : String(e));
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
    page.off("response", onResponse);
  }
  checked++;
  if (errors.length) failures.push(`${label}\n    ${errors.join("\n    ")}`);
}

const visit = (page: Page, path: string, selector: string, check?: (page: Page) => Promise<string | undefined>) =>
  step(page, path, () => page.goto(base + path, { waitUntil: "domcontentloaded" }), selector, { check });

const hrefs = (page: Page, selector: string) =>
  page.$$eval(selector, (as) => [...new Set(as.map((a) => new URL((a as HTMLAnchorElement).href).pathname))]);

/** 報告が届いていれば失敗にする（label は確認した場面） */
function noReports(label: string, reports: Report[]) {
  checked++;
  if (!reports.length) return;
  // 同じエラーはまとめ、どのページで起きたかを添える
  const byError = new Map<string, string[]>();
  for (const r of reports) byError.set(r.error, [...(byError.get(r.error) ?? []), r.path]);
  const lines = [...byError].map(([error, paths]) => {
    const hint = HYDRATION_ERRORS.test(error)
      ? "\n      → ビルド時の HTML と、ブラウザでの最初の描画が食い違っている（src/hydration.ts を参照）"
      : "";
    const where = paths.length > 5 ? `${paths.slice(0, 5).join(", ")} ほか ${paths.length - 5} ページ` : paths.join(", ");
    return `${error}${hint}\n      ${paths.length} ページ: ${where}`;
  });
  failures.push(`${label}: エラーの報告が送られた（${reports.length} 件）\n    ${lines.join("\n    ")}`);
}

try {
  const context = await browser.newContext();
  // 普通に見て回る間は、エラーの報告（/api/errors）が 1 件も送られないこと
  const reported = await catchReports(context);
  const page = await context.newPage();

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
  // カードの中にはイベント・各ページへのリンクもあるので、グループ名のリンクだけを使う
  const artists = await hrefs(page, ".artist-list a.artist-card-head");
  if (artists.length === 0) failures.push("/: アーティストが 1 件も表示されていない");

  /** アーティストごとの曲・イベントのページ（後の確認で使う） */
  const found = new Map<string, { songs: string[]; events: string[] }>();
  for (const artist of artists) {
    // 未披露の曲も含めて全曲のリンクを集める
    await visit(page, `${artist}/songs?unplayed=1`, ".stats-table tbody tr", async (p) =>
      (await p.locator(".stats-table tbody tr").count()) > 0 ? undefined : "曲の行が無い",
    );
    const songs = await hrefs(page, "a.song-title");
    // 開催予定は折りたたまれているので、表示されているイベントの行を待つ
    await visit(page, `${artist}/events`, "a.event-row:visible");
    const events = await hrefs(page, ".event-list a.event-row");
    found.set(artist, { songs, events });
    await visit(page, `${artist}/trends`, ".trend-grid");
    await visit(page, `${artist}/members`, ".member-cards li");
    await visit(page, `${artist}/attendance`, ".attend-source");

    for (const path of songs) await visit(page, path, ".song-detail-title");
    for (const path of events) await visit(page, path, ".event-detail-title");
    if (songs.length === 0) failures.push(`${artist}/songs: 曲へのリンクが無い`);
    if (events.length === 0) failures.push(`${artist}/events: イベントへのリンクが無い`);

    // 以前の hash ルーティングのリンクが通常のパスに置き換わること
    if (songs[0]) {
      await visit(page, `/#${songs[0]}`, ".song-detail-title", async (p) =>
        new URL(p.url()).pathname === songs[0] ? undefined : `hash リンクが ${songs[0]} に置き換わらない（${p.url()}）`,
      );
    }
  }

  // サイトの中でリンクを押して移動する（ページを読み直さずに描き替わる）。押すたびにエラーが出ないこと
  const first = artists[0];
  if (first) {
    await visit(page, "/", ".artist-list");
    await page.evaluate(() => Object.assign(window, { __smokeNoReload: true }));
    const nav = (label: string, click: string, url: RegExp, selector: string) =>
      step(page, `[サイト内の移動] ${label}`, () => page.locator(click).first().click(), selector, { url });
    const esc = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await nav("トップ → グループ", "a.artist-card-head", new RegExp(`${esc}(/songs)?$`), ".stats-table tbody tr");
    await nav("楽曲 → 曲", "a.song-title:visible", new RegExp(`${esc}/songs/[^/]+$`), ".song-detail-title");
    await nav("曲 → イベントのタブ", 'nav.tabs a[href$="/events"]', new RegExp(`${esc}/events$`), ".event-list a.event-row:visible");
    await nav("イベント一覧 → イベント", ".event-list a.event-row:visible", new RegExp(`${esc}/events/\\d+$`), ".event-detail-title");
    await step(page, "[サイト内の移動] 戻る", () => page.goBack(), ".event-list a.event-row:visible", {
      url: new RegExp(`${esc}/events$`),
    });
    checked++;
    if (!(await page.evaluate(() => "__smokeNoReload" in window)))
      failures.push("[サイト内の移動] リンクを押したらページ全体が読み直された");
  }

  // 絞り込みの入力欄に日本語を変換して入れられること（入力欄を URL から描き直すと、変換中の文字が壊れて「ｗわわｔ…」になる）
  if (first) {
    await step(
      page,
      "[日本語入力] 楽曲の絞り込み",
      () => page.goto(`${base}${first}/songs`, { waitUntil: "domcontentloaded" }),
      ".only-wide input[type=search]",
      {
        check: async (p) => {
          const input = p.locator(".only-wide input[type=search]");
          await input.click();
          // Chrome の IME の操作（DevTools Protocol）で、ローマ字入力の途中経過を送ってから確定する
          const cdp = await p.context().newCDPSession(p);
          for (const t of ["ｗ", "わ", "わｔ", "わた", "わたｎ", "わたな", "わたなｂ", "わたなべ"]) {
            await cdp.send("Input.imeSetComposition", { text: t, selectionStart: t.length, selectionEnd: t.length });
          }
          await cdp.send("Input.insertText", { text: "渡辺" });
          await cdp.detach();
          await p.waitForURL(/[?&]q=/, { timeout: 5_000 }).catch(() => {});
          const value = await input.inputValue();
          return value === "渡辺" ? undefined : `「渡辺」と入力したのに「${value}」になった`;
        },
      },
    );
  }

  noReports("見て回る間", reported);
  await context.close();

  // JavaScript なしでも中身が HTML に入っていること（ビルド時の描画。検索エンジンや、JS の読み込み前の表示）
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  try {
    const p = await noJs.newPage();
    const sample = first ? found.get(first) : undefined;
    for (const [path, selector] of [
      ["/", ".artist-list a.artist-card-head"],
      ...(first
        ? ([
            [`${first}/songs`, ".stats-table tbody tr"],
            [`${first}/events`, ".event-list a.event-row:visible"],
          ] as const)
        : []),
      ...(sample?.songs[0] ? [[sample.songs[0], ".song-detail-title"] as const] : []),
      ...(sample?.events.at(-1) ? [[sample.events.at(-1)!, ".event-detail-title"] as const] : []),
    ] as const) {
      // JS なしでは後から何も出てこないので、待たずにその場で数える
      await step(p, `[JS なし] ${path}`, () => p.goto(base + path, { waitUntil: "domcontentloaded" }), "body", {
        check: async (pg) => {
          if (!(await pg.locator(`#root[data-prerendered="${path}"]`).count()))
            return "ビルド時に描いた HTML ではない（中身の無い型のまま）";
          return (await pg.locator(selector).count()) ? undefined : `HTML に ${selector} が無い`;
        },
      });
    }
  } finally {
    await noJs.close();
  }

  // 参戦記録があるとき：引き継ぎの後で印を描き足すので、記録の無いときと別の道筋になる。
  // 古い方から 2 件（確実に開催済み）を参戦済みにして、一覧・イベント・参戦記録のページを開く
  const withRecord = first ? found.get(first)?.events.slice(-2) : undefined;
  if (first && withRecord?.length) {
    const ids = withRecord.map((p) => Number(p.split("/").at(-1)));
    const ctx = await browser.newContext();
    try {
      const reports = await catchReports(ctx);
      await ctx.addInitScript(
        (manual) => {
          localStorage.setItem("lovely-memory:attendance:v1", JSON.stringify({ manual }));
        },
        Object.fromEntries(ids.map((id) => [id, true])),
      );
      const p = await ctx.newPage();
      const marked = (sel: string, label: string) => async (pg: Page) => {
        // 印は引き継ぎの後で描き足されるので、少し待つ
        try {
          await pg.waitForSelector(sel, { timeout: 10_000 });
          return undefined;
        } catch {
          return `${label}が表示されない`;
        }
      };
      await visit(p, `${first}/events`, "a.event-row:visible", marked(".attend-toggle.on", "参戦済みの印"));
      await visit(p, withRecord[0]!, ".event-detail-title", marked(".attend-toggle.on", "参戦済みの印"));
      await visit(p, `${first}/attendance`, ".attend-source", async (pg) => {
        const v = await marked(".attendance .stat-value", "参戦の数")(pg);
        if (v) return v;
        const n = (await pg.locator(".attendance .stat-value").first().textContent())?.trim();
        return n?.startsWith(String(ids.length)) ? undefined : `参戦したイベントが ${ids.length} のはずが「${n}」`;
      });
      noReports("[参戦記録あり]", reports);
    } finally {
      await ctx.close();
    }
  }

  // ページのコードを読み込めないとき：エラーの画面が出て、報告が送られること
  const broken = await browser.newContext();
  try {
    const p = await broken.newPage();
    await p.route(/\/assets\/SongStatsPage-[^/]+\.js$/, (route) => route.abort());
    // わざと起こしたエラーなので、報告はブラウザ側で受け止める（中身は下で確かめる。サーバーに届くと [client error] と表示されて紛らわしい）
    await p.route("**/api/errors", (route) => route.fulfill({ status: 204 }));
    const report = p.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/errors", { timeout: 10_000 });
    await p.goto(base + `${artists[0] ?? ""}/songs`, { waitUntil: "domcontentloaded" });
    try {
      await p.waitForSelector(".route-error", { timeout: 10_000 });
      const body = JSON.parse((await report).postData() ?? "{}") as { kind?: string; path?: string };
      if (body.kind !== "render" || !body.path?.endsWith("/songs")) failures.push(`エラーの報告の中身がおかしい: ${JSON.stringify(body)}`);
    } catch (e) {
      failures.push(`ページのコードを読み込めないとき: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
    checked++;
  } finally {
    await broken.close();
  }

  // オフライン：一度開いて Service Worker が有効になった後、ネットワークを切っても
  // まだ開いていないページを含めて表示できること
  const offline = await browser.newContext();
  try {
    const p = await offline.newPage();
    await p.goto(base + "/", { waitUntil: "load" });
    // Service Worker が入らない（事前キャッシュの失敗など）と ready が終わらないので、待つのは 15 秒まで
    const ready = await p.evaluate(() =>
      Promise.race([navigator.serviceWorker.ready.then(() => "ok"), new Promise((r) => setTimeout(() => r("timeout"), 15_000))]),
    );
    if (ready !== "ok") throw new Error("Service Worker が有効にならない（sw.js の事前キャッシュの失敗など）");
    const artist = (await hrefs(p, ".artist-list a.artist-card-head"))[0];
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
  console.error(`smoke: ${failures.length}/${checked} 件で問題\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`smoke: ${checked} 件 OK`);
