import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  computePatterns,
  computeStats,
  displayTitle,
  formatDate,
  formatPercent,
  tieupText,
  isLiveEvent,
  positionRole,
  resolveEvents,
  Setlist,
  type ArtistConfig,
} from "@lovely-memory/core";
import { eventCard, songCard } from "../og/cards.ts";
import { pageHtml, type PageMeta } from "../og/meta.ts";
import { ARTISTS_DIR, loadArtist, loadEvents, loadOverrides, loadSetlistFiles, loadSongs, REPO_ROOT, siteUrl } from "../repo.ts";

const SITE_NAME = "ラブリィメモリー";

type Card = { file: string; html: string };
type Page = { path: string; meta: PageMeta };

/**
 * 曲・公演などのページごとに OGP 用の HTML（<path>.html）と画像（og/…png）をビルド結果に追加する。
 * Cloudflare Pages は /a/b を a/b.html で返すので、SNS のクローラーにページごとのカードが見える。
 */
export async function ogPages(artistArg: string, opts: { dist?: string; "skip-images"?: boolean; only?: string }): Promise<void> {
  const site = siteUrl();
  if (!site) throw new Error("SITE_URL が未設定（og:url・og:image に絶対 URL が必要）");
  const dist = resolve(REPO_ROOT, opts.dist ?? "apps/web/dist");
  const base = await readFile(join(dist, "index.html"), "utf8");
  const host = new URL(site).host;

  const ids = artistArg === "all" ? (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name) : [artistArg];
  const pages: Page[] = [];
  const cards: Card[] = [];
  for (const id of ids) {
    const r = await collect(await loadArtist(id), site, host);
    pages.push(...r.pages);
    cards.push(...r.cards);
  }

  for (const p of pages) {
    const file = join(dist, `${p.path}.html`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, pageHtml(base, p.meta));
  }
  console.log(`pages: ${pages.length}`);

  if (opts["skip-images"]) return;
  const targets = opts.only ? cards.filter((c) => c.file.includes(opts.only!)) : cards;
  await renderCards(targets, dist);
  console.log(`images: ${targets.length}`);
}

async function collect(artist: ArtistConfig, site: string, host: string): Promise<{ pages: Page[]; cards: Card[] }> {
  const songs = await loadSongs(artist.id);
  const events = resolveEvents(await loadEvents(artist.id), await loadOverrides(artist.id), artist);
  const setlists = (await loadSetlistFiles(artist.id)).map((f) => Setlist.parse(f.raw));
  const stats = computeStats({ songs, events, setlists });
  const patterns = computePatterns(stats.events);
  const setlistByEvent = new Map(stats.events.map((e) => [e.event.id, e]));

  const name = artist.subtitle ? `${artist.name}（${artist.subtitle}）` : artist.name;
  const title = (t?: string) => (t ? `${t} — ${artist.name} | ${SITE_NAME}` : `${artist.name} | ${SITE_NAME}`);
  const url = (path: string) => `${site}${path}`;
  const pages: Page[] = [];
  const cards: Card[] = [];

  // 一覧ページはサイト共通の画像のまま、タイトルと説明だけ変える
  const sections: Array<[string, string, string]> = [
    ["", "", `${name}のライブのセットリストを記録・集計。曲ごとの歌唱率や初披露、公演ごとのセトリを見られます。`],
    ["songs", "楽曲", `${name}の楽曲ごとの歌唱回数・歌唱率・初披露日・最後に歌われた日。`],
    ["events", "公演", `${name}の公演一覧とセットリスト（${stats.events.length} 公演）。`],
    ["trends", "傾向", `${name}のセトリの傾向。1 曲目・ラストになりやすい曲、定番の流れ、よく続けて歌われる曲。`],
    ["members", "メンバー", `${name}のメンバーごとの出演率と欠席した公演。`],
  ];
  for (const [path, label, description] of sections) {
    const p = path ? `${artist.id}/${path}` : artist.id;
    pages.push({ path: p, meta: { title: title(label || undefined), description, url: url(p) } });
  }

  for (const s of stats.songs) {
    const p = `${artist.id}/songs/${s.song.id}`;
    const img = `og/${p}.png`;
    const position = patterns.positions.find((x) => x.song.id === s.song.id);
    const role = position && positionRole(position);
    const tieup = s.song.tieups.length ? `${s.song.tieups.map(tieupText).join("・")}。` : "";
    const description =
      tieup +
      (s.count === 0
        ? `「${s.song.title}」はまだ歌われていません（${artist.name}）。`
        : s.song.cover
          ? `「${s.song.title}」（カバー曲・原曲: ${s.song.cover.artist}）の歌唱 ${s.count} 回。初披露 ${formatDate(s.first!.date)}・最終 ${formatDate(s.last!.date)}。`
          : `「${s.song.title}」の歌唱率 ${formatPercent(s.rate)}（${s.events}/${s.eligibleEvents} 公演）・歌唱 ${s.count} 回。初披露 ${formatDate(s.first!.date)}・最終 ${formatDate(s.last!.date)}。${role === "closer" ? "ラスト定番曲。" : role === "opener" ? "1 曲目の定番曲。" : ""}`);
    pages.push({ path: p, meta: { title: title(s.song.title), description, url: url(p), image: url(img), imageAlt: `「${s.song.title}」の歌唱記録` } });
    cards.push({ file: img, html: songCard(artist, s, position, role, host) });
  }

  for (const e of events.filter(isLiveEvent)) {
    const p = `${artist.id}/events/${e.id}`;
    const img = `og/${p}.png`;
    const sl = setlistByEvent.get(e.id);
    const songTitles = sl?.stages.flatMap((st) => st.entries.map((x) => x.song.title)) ?? [];
    const head = `${formatDate(e.date)}「${displayTitle(e.title, artist.name)}」`;
    const description = songTitles.length
      ? `${head}のセットリスト（${songTitles.length} 曲）: ${songTitles.join(" / ")}`
      : `${head}${e.venue ? ` @ ${e.venue.name}` : ""}`;
    pages.push({ path: p, meta: { title: title(`${formatDate(e.date)} ${displayTitle(e.title, artist.name)}`), description, url: url(p), image: url(img), imageAlt: `${head}のセットリスト` } });
    cards.push({ file: img, html: eventCard(artist, e, sl, host) });
  }
  return { pages, cards };
}

async function renderCards(cards: Card[], dist: string): Promise<void> {
  const { chromium } = await import("playwright-core");
  // ローカルの Google Chrome（GitHub Actions の ubuntu-latest にも入っている）を使う。CHROME_PATH で上書き可
  const executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(executablePath && existsSync(executablePath) ? { executablePath } : { channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    for (const c of cards) {
      await page.setContent(c.html, { waitUntil: "load" });
      // フォント読み込み後に文字サイズを合わせる（ブラウザ側で実行。CLI の型定義に DOM は無いので文字列で渡す）
      await page.evaluate("document.fonts.ready.then(() => window.__fit())");
      const file = join(dist, c.file);
      await mkdir(dirname(file), { recursive: true });
      await page.screenshot({ path: file, type: "png" });
    }
  } finally {
    await browser.close();
  }
}
