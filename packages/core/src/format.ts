/* 表示用の書式（ブラウザ・CLI〔OGP 生成〕で共通） */
import type { EventType, Tieup } from "./schema.ts";

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
