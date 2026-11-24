import { readdir } from "node:fs/promises";
import { displayTitle } from "@lovely-memory/core";
import { ARTISTS_DIR, CLOUDFLARE_ACCOUNT_ID, loadArtist, loadEvents, loadSongs } from "../repo.ts";

/*
 * サイトの訪問の記録（Cloudflare Web Analytics）を見る。pnpm lm analytics all [--days 14]
 * Cloudflare の GraphQL Analytics API から読む。トークンは環境変数 CLOUDFLARE_ANALYTICS_TOKEN
 * （権限は Account Analytics: Read だけ。作り方は docs/maintenance.md）。
 * CLOUDFLARE_API_TOKEN にしないこと：wrangler がそれを使うようになり、D1・デプロイの操作ができなくなる。
 * Web Analytics はページのスクリプトで数えるので、JS を動かさないクローラーは入らない。Cookie は使わない。
 * - Cloudflare がボットと判定したものは除く。ただし Googlebot など、ページを描画するクローラーは混ざる
 *   （アメリカから 1 ページだけ・Android や Linux の Chrome、という訪問はたいていそれ）
 * - 数は Cloudflare が抜き取って数えた推定値（少ないうちは 10 の倍数になる）
 */

const API = "https://api.cloudflare.com/client/v4/graphql";

type Group<D> = { count: number; sum?: { visits: number }; dimensions: D };

type Vitals = {
  quantiles: Record<
    | "largestContentfulPaintP75"
    | "interactionToNextPaintP75"
    | "cumulativeLayoutShiftP75"
    | "firstContentfulPaintP75"
    | "timeToFirstByteP75",
    number | null
  >;
  sum: Record<`${"lcp" | "inp" | "cls" | "fcp" | "ttfb"}${"Good" | "NeedsImprovement" | "Poor" | "Total"}`, number>;
};

type Result = {
  total: Group<object>[];
  hours: Group<{ datetimeHour: string }>[];
  paths: Group<{ requestPath: string }>[];
  referers: Group<{ refererHost: string }>[];
  countries: Group<{ countryName: string }>[];
  devices: Group<{ deviceType: string }>[];
  browsers: Group<{ userAgentBrowser: string }>[];
  vitals: Vitals[];
};

// 同じ期間・アカウントで、まとめ方だけ違う集計を 1 回で取る
const QUERY = `query ($account: String!, $since: Time!, $until: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $f) { count sum { visits } }
    hours: rumPageloadEventsAdaptiveGroups(limit: 5000, filter: $f, orderBy: [datetimeHour_ASC]) { count sum { visits } dimensions { datetimeHour } }
    paths: rumPageloadEventsAdaptiveGroups(limit: 20, filter: $f, orderBy: [count_DESC]) { count dimensions { requestPath } }
    referers: rumPageloadEventsAdaptiveGroups(limit: 15, filter: $f, orderBy: [sum_visits_DESC]) { count sum { visits } dimensions { refererHost } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $f, orderBy: [sum_visits_DESC]) { count sum { visits } dimensions { countryName } }
    devices: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $f, orderBy: [sum_visits_DESC]) { count sum { visits } dimensions { deviceType } }
    browsers: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $f, orderBy: [sum_visits_DESC]) { count sum { visits } dimensions { userAgentBrowser } }
    vitals: rumWebVitalsEventsAdaptiveGroups(limit: 1, filter: $v) {
      quantiles { largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 firstContentfulPaintP75 timeToFirstByteP75 }
      sum {
        lcpGood lcpNeedsImprovement lcpPoor lcpTotal inpGood inpNeedsImprovement inpPoor inpTotal
        clsGood clsNeedsImprovement clsPoor clsTotal fcpGood fcpNeedsImprovement fcpPoor fcpTotal
        ttfbGood ttfbNeedsImprovement ttfbPoor ttfbTotal
      }
    }
  } }
}`
  // 表示の記録はボットを除く（$f）。表示の速さ（rumWebVitals）にはボットの区別が無い（$v）
  .replaceAll("$f", "{ datetime_geq: $since, datetime_lt: $until, bot: 0 }")
  .replaceAll("$v", "{ datetime_geq: $since, datetime_lt: $until }");

async function fetchAnalytics(since: Date, until: Date): Promise<Result> {
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN?.trim();
  if (!token)
    throw new Error(
      "環境変数 CLOUDFLARE_ANALYTICS_TOKEN がありません（作り方は docs/maintenance.md）。設定したばかりなら、VS Code やターミナルをすべて閉じて開き直してください。",
    );
  const res = await fetch(API, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { account: CLOUDFLARE_ACCOUNT_ID, since: since.toISOString(), until: until.toISOString() },
    }),
  });
  const body = (await res.json()) as {
    data?: { viewer: { accounts: Result[] } } | null;
    errors?: Array<{ message: string }> | null;
  };
  if (body.errors?.length || !body.data) {
    const message = body.errors?.map((e) => e.message).join(" / ") ?? `HTTP ${res.status}`;
    const auth = /auth|permission|not authorized/i.test(message);
    throw new Error(
      auth
        ? `Cloudflare に読ませてもらえませんでした（${message}）。トークンの権限（Account Analytics: Read）と対象のアカウントを確かめてください。`
        : `Cloudflare の API がエラーを返しました: ${message}`,
    );
  }
  const account = body.data.viewer.accounts[0];
  if (!account) throw new Error("アカウントが見つかりません（トークンの対象のアカウントを確かめてください）");
  return account;
}

/** 日本時間の日付（YYYY-MM-DD） */
const jstDate = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "-");
const bar = (n: number, max: number, width = 24) => "█".repeat(max ? Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width)) : 0);
const pad = (s: string | number, n: number) => String(s).padStart(n);

/** 「/taiyotsukiyo-2nd/songs/s012」→ 曲名・イベント名を添えて読めるように */
async function pathLabeler(): Promise<(path: string) => string> {
  const names = new Map<string, string>();
  const ids = (await readdir(ARTISTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const id of ids) {
    const artist = await loadArtist(id);
    for (const s of await loadSongs(id)) names.set(`/${id}/songs/${s.id}`, `曲「${s.title}」`);
    for (const e of await loadEvents(id)) names.set(`/${id}/events/${e.id}`, `${e.date} ${displayTitle(e.title, artist.name)}`);
  }
  const SECTIONS: Record<string, string> = {
    songs: "楽曲",
    events: "イベント",
    trends: "傾向",
    members: "メンバー",
    attendance: "参戦記録",
  };
  return (path) => {
    const p = path.replace(/\/$/, "") || "/";
    if (p === "/") return "トップ";
    const named = names.get(p);
    if (named) return named;
    const [, , section, rest] = p.split("/");
    return section && !rest && SECTIONS[section] ? SECTIONS[section] : p;
  };
}

/** 流入元のホストを、検索・SNS などの分かりやすい名前に */
function refererLabel(host: string, siteHost: string): string {
  if (!host) return "直接（ブックマーク・アプリ内のリンクなど）";
  if (host === siteHost || host.endsWith(".pages.dev")) return "サイト内";
  if (/(^|\.)google\./.test(host)) return `Google 検索（${host}）`;
  if (/(^|\.)bing\.com$/.test(host)) return `Bing 検索（${host}）`;
  if (/(^|\.)yahoo\.co\.jp$/.test(host)) return `Yahoo! 検索（${host}）`;
  if (host === "t.co" || /(^|\.)(x|twitter)\.com$/.test(host)) return `X（${host}）`;
  return host;
}

const VITALS: Array<{ key: "lcp" | "inp" | "cls" | "fcp" | "ttfb"; q: keyof Vitals["quantiles"]; label: string; unit: "ms" | "" }> = [
  { key: "lcp", q: "largestContentfulPaintP75", label: "LCP（主な中身が出るまで）", unit: "ms" },
  { key: "inp", q: "interactionToNextPaintP75", label: "INP（操作への反応）", unit: "ms" },
  { key: "cls", q: "cumulativeLayoutShiftP75", label: "CLS（表示のずれ）", unit: "" },
  { key: "fcp", q: "firstContentfulPaintP75", label: "FCP（最初に何か出るまで）", unit: "ms" },
  { key: "ttfb", q: "timeToFirstByteP75", label: "TTFB（サーバーの応答）", unit: "ms" },
];

/** pnpm lm analytics all [--days 14] */
export async function analytics(_artistId: string, opts: { days?: string }): Promise<void> {
  const days = Number(opts.days ?? 14);
  if (!Number.isInteger(days) || days <= 0 || days > 31) throw new Error("--days は 1〜31 の整数");
  const until = new Date();
  const since = new Date(until.getTime() - days * 86400_000);
  const [r, label] = await Promise.all([fetchAnalytics(since, until), pathLabeler()]);
  const siteHost = new URL(process.env.SITE_URL?.trim() || "https://lovely-memory.moe/").host;

  const views = r.total[0]?.count ?? 0;
  const visits = r.total[0]?.sum?.visits ?? 0;
  console.log(`直近 ${days} 日（${jstDate(since.toISOString())} 〜 ${jstDate(until.toISOString())}、日本時間）`);
  console.log(`  ページの表示 ${views} 回・訪問 ${visits} 回（1 訪問あたり ${visits ? (views / visits).toFixed(1) : "-"} ページ）`);
  console.log("  ※ Cloudflare が抜き取って数えた推定値。ボットと判定されたものは除いている（Googlebot などは混ざる）\n");
  if (!views) return;

  // 日ごと（日本時間）
  const byDay = new Map<string, { views: number; visits: number }>();
  for (const h of r.hours) {
    const d = jstDate(h.dimensions.datetimeHour);
    const v = byDay.get(d) ?? { views: 0, visits: 0 };
    v.views += h.count;
    v.visits += h.sum?.visits ?? 0;
    byDay.set(d, v);
  }
  const maxVisits = Math.max(...[...byDay.values()].map((v) => v.visits));
  console.log("■ 日ごとの訪問（表示）");
  for (const [d, v] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const w = WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];
    console.log(`  ${d.slice(5)}（${w}） ${pad(v.visits, 4)}（${pad(v.views, 4)}） ${bar(v.visits, maxVisits)}`);
  }

  console.log("\n■ よく見られたページ（表示）");
  for (const p of r.paths) console.log(`  ${pad(p.count, 5)}  ${pct(p.count, views).padStart(4)}  ${label(p.dimensions.requestPath)}`);

  console.log("\n■ どこから来たか（訪問）");
  const referers = new Map<string, number>();
  for (const g of r.referers) {
    const name = refererLabel(g.dimensions.refererHost, siteHost);
    referers.set(name, (referers.get(name) ?? 0) + (g.sum?.visits ?? 0));
  }
  for (const [name, n] of [...referers].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]))
    console.log(`  ${pad(n, 5)}  ${pct(n, visits).padStart(4)}  ${name}`);

  const top = <D>(title: string, groups: Group<D>[], name: (d: D) => string) => {
    const line = groups.map((g) => `${name(g.dimensions) || "?"} ${pct(g.sum?.visits ?? 0, visits)}`).join(" / ");
    console.log(`  ${title}: ${line}`);
  };
  console.log("\n■ 国・端末・ブラウザ（訪問の割合）");
  top("国", r.countries, (d) => d.countryName);
  top("端末", r.devices, (d) => d.deviceType);
  top("ブラウザ", r.browsers, (d) => d.userAgentBrowser);

  const v = r.vitals[0];
  if (v) {
    console.log("\n■ 表示の速さ（Core Web Vitals。75% の訪問がこれ以内・良い / 要改善 / 悪い の割合）");
    for (const m of VITALS) {
      const value = v.quantiles[m.q];
      const total = v.sum[`${m.key}Total`];
      if (value == null || !total) {
        console.log(`  ${m.label}: 記録なし`);
        continue;
      }
      // 時間はマイクロ秒で返ってくる
      const shown = m.unit === "ms" ? `${Math.round(value / 1000)} ms` : value.toFixed(3);
      const share = [v.sum[`${m.key}Good`], v.sum[`${m.key}NeedsImprovement`], v.sum[`${m.key}Poor`]].map((n) => pct(n, total)).join(" / ");
      console.log(`  ${m.label}: ${shown}  （${share}、${total} 件）`);
    }
  }
}
