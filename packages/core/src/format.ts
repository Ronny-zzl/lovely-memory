/* 表示用の書式（ブラウザ・CLI〔OGP 生成〕で共通） */
import type { EventType, Song, SongVideo, Tieup } from "./schema.ts";

/** 作詞・作曲・編曲のうち同じ人をまとめる（例: [{ roles: "作詞・作曲", name: "カジ" }, { roles: "編曲", name: "tonerico" }]） */
export function creditParts(c: Song["credits"]): Array<{ roles: string; name: string }> {
  if (!c) return [];
  const groups: Array<{ roles: string[]; name: string }> = [];
  for (const [role, name] of [
    ["作詞", c.lyrics],
    ["作曲", c.music],
    ["編曲", c.arrangement],
  ] as const) {
    if (!name) continue;
    const g = groups.find((x) => x.name === name);
    if (g) g.roles.push(role);
    else groups.push({ roles: [role], name });
  }
  return groups.map((g) => ({ roles: g.roles.join("・"), name: g.name }));
}

/** 「作詞・作曲：カジ」「編曲：tonerico」の行 */
export const formatCredits = (c: Song["credits"]) => creditParts(c).map((p) => `${p.roles}：${p.name}`);

export const VIDEO_KIND_LABEL: Record<SongVideo["kind"], string> = {
  mv: "Music Video",
  live: "ライブ映像",
  dance: "Dance Practice",
  parts: "歌割動画",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  oneman: "単独公演",
  taiban: "主催対バン",
  external: "対バン・フェス",
  release: "リリイベ",
  free: "フリーライブ",
  tokuten: "特典会",
};

/** セトリが存在しうる種別（tokuten はライブが無いので除外） */
export const LIVE_EVENT_TYPES: EventType[] = ["oneman", "taiban", "external", "release", "free"];

export const formatDate = (iso: string) => iso.replaceAll("-", ".");

export const formatPercent = (r: number) => `${Math.round(r * 100)}%`;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-11-08" → "11.08 (日)" */
export function formatDayWithWeekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")} (${wd})`;
}

/** イベント名の先頭に付いているグループ名を省く（一覧を短くするため） */
export function displayTitle(title: string, artistName: string): string {
  const t = title.startsWith(artistName) ? title.slice(artistName.length).replace(/^[\s　/／:：-]+/, "") : title;
  // 「〇〇 Presents …」「〇〇主催 …」のようにグループ名が文の一部になっているものは、そのまま残す
  if (/^(presents?\b|pre\.|プレゼンツ|主催|企画)/i.test(t)) return title;
  return t || title;
}

export const eventernoteUrl = (eventId: number) => (eventId > 0 ? `https://www.eventernote.com/events/${eventId}` : undefined);

/** Asia/Tokyo での今日（YYYY-MM-DD） */
export const todayJst = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());

/** from から to までの日数（どちらも YYYY-MM-DD） */
export function daysBetween(from: string, to: string): number {
  const t = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(to) - t(from)) / 86_400_000);
}

export const TIEUP_TYPE_LABEL: Record<Tieup["type"], string> = {
  anime: "アニメ",
  drama: "ドラマ",
  movie: "映画",
  game: "ゲーム",
  cm: "CM",
  other: "タイアップ",
};

/** 例: アニメ『Turkey!』エンディングテーマ */
export const tieupText = (t: Tieup) => `${TIEUP_TYPE_LABEL[t.type]}『${t.work}』${t.role ?? ""}`;

/** 曲の一覧に付ける印（種類ごとに 1 つ） */
export const tieupLabels = (tieups: Tieup[]) => [...new Set(tieups.map((t) => TIEUP_TYPE_LABEL[t.type]))];

export const POSITION_ROLE_LABEL = { opener: "1曲目定番", closer: "ラスト定番" } as const;

/** 達成した節目の短い表記（曲名は含まない） */
export function milestoneText(m: import("./milestones.ts").Milestone): string {
  switch (m.kind) {
    case "song-count":
      return `通算 ${m.count} 回目`;
    case "song-streak":
      return `${m.streak} 回連続`;
    case "song-return":
      return `${m.gap} 回ぶり`;
    case "event-count":
      return `通算 ${m.count} 回目のイベント`;
    case "total-songs":
      return `通算 ${m.count} 曲目`;
    case "debut-days":
      return m.years ? `デビュー ${m.years} 周年` : `デビュー ${m.days} 日`;
  }
}

/** "2007-02-25" → "2月25日" */
export const formatMonthDay = (iso: string) => `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;

/** 誕生日までの日数の表記 */
export const birthdayCountdown = (days: number) => (days === 0 ? "今日が誕生日！" : days === 1 ? "明日" : `あと ${days} 日`);
/** 「20歳の誕生日・あと 98 日」（当日は「今日が20歳の誕生日！」） */
export const birthdayWithAge = (b: { days: number; age: number }) =>
  b.days === 0 ? `今日が${b.age}歳の誕生日！` : `${b.age}歳の誕生日・${birthdayCountdown(b.days)}`;

/**
 * 白に近い色か（メンバーカラーが白のときなど）。明るい背景の上では見えないので、点に縁を付けたり線を灰色にしたりする。
 * 相対輝度（WCAG）が 0.8 を超えるもの
 */
export function isLightColor(hex: string): boolean {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const lin = (c: string) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(m[1]!) + 0.7152 * lin(m[2]!) + 0.0722 * lin(m[3]!) > 0.8;
}
