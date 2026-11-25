import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  ageOn,
  birthdayMembers,
  computeMilestones,
  computePatterns,
  computeStats,
  heldCheck,
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
import { jstDateDaysAgo } from "./sync.ts";
import { breadcrumbs, pageHtml, sitemap, type PageMeta } from "../og/meta.ts";
import { ARTISTS_DIR, loadArtist, loadEvents, loadOverrides, loadSetlistFiles, loadSongs, REPO_ROOT, siteUrl } from "../repo.ts";

const SITE_NAME = "ラブリィメモリー";

type Card = { file: string; html: string };
type Page = {
  /** サイト内のパス（先頭の / なし。トップは ""） */
  path: string;
  meta: PageMeta;
  /** sitemap.xml の lastmod（中身が最後に変わった日） */
  lastmod?: string;
  /** sitemap.xml に載せない（別のページへ移るだけのページ） */
  noSitemap?: boolean;
};

/**
 * 曲・イベントなどのページごとに OGP 用の meta を HTML（<path>.html）に入れ、画像（og/…png）をビルド結果に追加する。
 * Cloudflare Pages は /a/b を a/b.html で返すので、SNS のクローラーにページごとのカードが見える。
 */
export async function ogPages(artistArg: string, opts: { dist?: string; "skip-images"?: boolean; only?: string }): Promise<void> {
  const site = siteUrl();
  if (!site) throw new Error("SITE_URL が未設定（og:url・og:image に絶対 URL が必要）");
  const dist = resolve(REPO_ROOT, opts.dist ?? "apps/web/dist");
  const shell = await readFile(join(dist, existsSync(join(dist, "shell.html")) ? "shell.html" : "index.html"), "utf8");
  const host = new URL(site).host;

  const ids =
    artistArg === "all"
      ? (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
      : [artistArg];
  const pages: Page[] = [];
  const cards: Card[] = [];
  const artists: ArtistConfig[] = [];
  for (const id of ids) {
    const artist = await loadArtist(id);
    // 下書きのアーティストは公開サイトに無い（INCLUDE_DRAFTS=1 のプレビューのビルドだけ）
    if (artist.draft && process.env.INCLUDE_DRAFTS !== "1") continue;
    const r = await collect(artist, site, host);
    artists.push(artist);
    pages.push(...r.pages);
    cards.push(...r.cards);
  }
  // トップ：サイト名を検索結果に出すための WebSite の構造化データも入れる
  // 略称（たいつき など）でも見つかるよう、タイトルに添える
  const names = artists.map((a) => (a.aliases?.length ? `${a.name}（${a.aliases.join("・")}）` : a.name)).join("・");
  const fullNames = artists.map(nameWithAliases).join("・");
  pages.unshift({
    path: "",
    meta: {
      title: `${SITE_NAME} — ${names}のセトリ記録・集計`,
      description: `${fullNames}のライブのセットリストを記録・集計する非公式ファンサイト。曲ごとの歌唱率や初披露、イベントごとのセトリを見られます。`,
      url: site,
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: site,
          inLanguage: "ja",
          // 何についてのサイトか（グループの正式名と略称）
          about: artists.map((a) => ({
            "@type": "MusicGroup",
            name: a.name,
            ...(a.aliases?.length ? { alternateName: a.aliases } : {}),
          })),
        },
      ],
    },
    lastmod: latest(pages.map((p) => p.lastmod)),
  });

  for (const p of pages) {
    const file = join(dist, p.path ? `${p.path}.html` : "index.html");
    await mkdir(dirname(file), { recursive: true });
    // ビルド時に中身を描いた HTML（apps/web/scripts/prerender.ts）があれば、それに meta を入れる。
    // 無ければ中身の無いアプリの枠（shell.html。無い古いビルドでは index.html）を型にする
    const template = existsSync(file) ? await readFile(file, "utf8") : shell;
    await writeFile(file, pageHtml(template, p.meta));
  }
  console.log(`pages: ${pages.length}`);

  // 検索エンジン向けの全ページ一覧（robots.txt から参照。画像の生成より先に書き、そちらが失敗しても残るようにする）
  await writeFile(
    join(dist, "sitemap.xml"),
    sitemap(pages.filter((p) => !p.noSitemap).map((p) => ({ url: p.meta.url, lastmod: p.lastmod }))),
  );

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
  // イベントカードに添える節目（サイトの「このイベントの記録」と同じ計算）
  const today = jstDateDaysAgo(0);
  const milestones = computeMilestones({
    stats,
    liveEvents: events.filter(isLiveEvent),
    since: artist.since,
    today,
    held: heldCheck(
      today,
      setlists.map((s) => s.event),
    ),
  });

  // 一覧ページの説明の主語（サブタイトル付き）。略称でも見つかるよう添える（曲・イベントのページは内容の説明を優先して入れない）
  const listName = nameWithAliases(artist);
  // 検索結果では先頭しか見えないので、探される言葉（曲名・イベント名・「セトリ」）を前に置く
  const title = (t?: string) => (t ? `${t} — ${artist.name} | ${SITE_NAME}` : `${artist.name} | ${SITE_NAME}`);
  const url = (path: string) => `${site}${path}`;
  const pages: Page[] = [];
  const cards: Card[] = [];
  // 中身はセトリが増えたときに変わる。一覧は最新のセトリの日、曲は最後に歌われた日、イベントはその日
  const latestSetlist = latest(stats.events.map((e) => e.event.date));
  // パンくず：ラブリィメモリー › <グループ> 楽曲 › 曲名
  const crumbs = (section: string, label: string, leaf?: { name: string; url: string }) =>
    breadcrumbs([
      { name: SITE_NAME, url: site },
      { name: `${artist.name} ${label}`, url: url(`${artist.id}/${section}`) },
      ...(leaf ? [leaf] : []),
    ]);

  // 一覧ページはサイト共通の画像のまま、タイトルと説明だけ変える
  // グループのトップ（/<id>）は楽曲のページへ移るだけ（_redirects）。正規の URL は楽曲のページにして、sitemap には載せない
  pages.push({
    path: artist.id,
    meta: {
      title: title(),
      description: `${listName}のライブのセットリストを記録・集計。曲ごとの歌唱率や初披露、イベントごとのセトリを見られます。`,
      url: url(`${artist.id}/songs`),
    },
    noSitemap: true,
  });

  // [パス, パンくずの名前, タイトル, 説明]
  const sections: Array<[string, string, string, string]> = [
    ["songs", "楽曲", "楽曲・歌唱率", `${listName}の楽曲ごとの歌唱回数・歌唱率・初披露日・最後に歌われた日。`],
    ["events", "イベント", "イベント・セトリ一覧", `${listName}のイベント一覧とセットリスト（${stats.events.length} イベント）。`],
    ["trends", "傾向", "セトリの傾向", `${listName}のセトリの傾向。1 曲目・ラストになりやすい曲、定番の流れ、よく続けて歌われる曲。`],
    ["members", "メンバー", "メンバー・出演記録", `${listName}のメンバーごとの出演率と欠席したイベント。`],
    [
      "attendance",
      "参戦記録",
      "参戦記録",
      `${listName}の参戦記録。参戦したイベントと、生で聴いた曲・まだ聴いていない曲（eventernote の参加イベントから読み込めます）。`,
    ],
  ];
  for (const [section, label, heading, description] of sections) {
    const p = `${artist.id}/${section}`;
    pages.push({
      path: p,
      meta: { title: title(heading), description, url: url(p), structuredData: [crumbs(section, label)] },
      lastmod: section === "attendance" ? undefined : latestSetlist,
    });
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
          : `「${s.song.title}」の歌唱率 ${formatPercent(s.rate)}（${s.events}/${s.eligibleEvents} イベント）・歌唱 ${s.count} 回。初披露 ${formatDate(s.first!.date)}・最終 ${formatDate(s.last!.date)}。${role === "closer" ? "ラスト定番曲。" : role === "opener" ? "1 曲目の定番曲。" : ""}`);
    pages.push({
      path: p,
      meta: {
        title: title(`${s.song.title} 歌唱率・セトリ`),
        description,
        url: url(p),
        image: url(img),
        imageAlt: `「${s.song.title}」の歌唱記録`,
        structuredData: [crumbs("songs", "楽曲", { name: s.song.title, url: url(p) })],
      },
      lastmod: s.last?.date,
    });
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
    const eventTitle = displayTitle(e.title, artist.name);
    pages.push({
      path: p,
      meta: {
        title: title(`${eventTitle}${sl ? " セトリ" : ""}（${formatDate(e.date)}）`),
        description,
        url: url(p),
        image: url(img),
        imageAlt: `${head}のセットリスト`,
        structuredData: [crumbs("events", "イベント", { name: eventTitle, url: url(p) })],
      },
      lastmod: sl ? e.date : undefined,
    });
    const highlights = {
      milestones: milestones.achieved.filter((m) => m.eventId === e.id),
      birthdays: birthdayMembers(artist.members, e.date).map((member) => ({ member, age: ageOn(member.birthday!, e.date) })),
    };
    cards.push({ file: img, html: eventCard(artist, e, sl, host, highlights) });
  }
  return { pages, cards };
}

/** 「太陽と踊れ月夜に唄え（Second Season / たいつき・太陽月夜）」の形 */
function nameWithAliases(a: ArtistConfig): string {
  const extra = [a.subtitle, a.aliases?.join("・")].filter(Boolean).join(" / ");
  return extra ? `${a.name}（${extra}）` : a.name;
}

/** いちばん新しい日付（YYYY-MM-DD。無ければ undefined） */
function latest(dates: Array<string | undefined>): string | undefined {
  return dates
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
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
