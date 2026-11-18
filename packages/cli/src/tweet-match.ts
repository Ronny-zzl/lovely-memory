import {
  hasNumberedItems,
  isLiveEvent,
  looksLikeSetlistAnnouncement,
  normalizeTitle,
  parseSetlistText,
  type ParsedStage,
  type ResolvedEvent,
} from "@lovely-memory/core";

/** tools/x-setlist-collector.js が出力する 1 ポスト */
export type CollectedTweet = {
  id: string;
  url: string;
  /** ISO 8601（UTC） */
  time: string;
  text: string;
  author?: string;
  /** タイムライン上で「さらに表示」により本文が切れている */
  truncated?: boolean;
};

/** 1 公演分のセトリ告知（スレッドで分割されたものは結合済み） */
export type SetlistPost = {
  /** 先頭ポストの id（対応表のキー） */
  id: string;
  url: string;
  time: string;
  text: string;
  tweets: CollectedTweet[];
  stages: ParsedStage[];
  /** 「1部」「2部」などの指定（1 ポストに複数部が載っていた場合） */
  part?: number;
  truncated: boolean;
};

const M_LINE = /^\s*M\s*0*(\d+)/gim;

function mNumbers(text: string): number[] {
  return [...text.matchAll(M_LINE)].map((m) => Number(m[1]));
}

/** Asia/Tokyo の "YYYY-MM-DDTHH:MM" */
export function toJst(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

const KANJI_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };

/** 「1部」「第２部」「二部」→ 数値 */
export function partNumber(s: string): number | undefined {
  const m = s.normalize("NFKC").match(/第?\s*([0-9]+|[一二三四五])\s*部/);
  if (!m) return undefined;
  return KANJI_NUM[m[1]!] ?? Number(m[1]);
}

/**
 * 収集したポストからセトリ告知を取り出す。
 * - 曲行（M1_ …）が無いポストは除外（ただし「セトリ」見出しがあれば曲名だけの列挙として読む）
 * - 続きのポスト（直前のポストの最終曲番号 +1 から始まり、20 分以内）は結合する
 * - 1 ポストに【1部】【2部】のように複数部が載っている場合は部ごとに分割する
 */
export type ExtractOptions = {
  /**
   * 曲名が songs.json にあるか。曲番号の無い告知（曲名の列挙）は、3 行以上かつ 8 割以上が
   * 既知の曲名である場合だけセトリとみなす（「本日の #太陽月夜」等の告知を除外するため）。
   * 省略時は曲番号の無い告知をすべて受け入れる。
   */
  isKnownSong?: (item: { label: string; title: string }) => boolean;
};

export function extractPosts(tweets: CollectedTweet[], opts: ExtractOptions = {}): SetlistPost[] {
  const sorted = [...tweets].sort((a, b) => a.time.localeCompare(b.time));
  const groups: CollectedTweet[][] = [];
  for (const t of sorted) {
    const nums = mNumbers(t.text);
    // 曲番号の無い告知は「セトリ」等の見出しがある場合のみ（リリース告知の収録曲一覧などを除外）
    if (!hasNumberedItems(t.text) && !looksLikeSetlistAnnouncement(t.text)) continue;
    const prev = groups.at(-1);
    const prevLast = prev ? mNumbers(prev.at(-1)!.text).at(-1) : undefined;
    const withinMinutes =
      prev && (new Date(t.time).getTime() - new Date(prev.at(-1)!.time).getTime()) / 60000 <= 20;
    if (prev && withinMinutes && prevLast !== undefined && nums[0] === prevLast + 1) prev.push(t);
    else groups.push([t]);
  }

  const posts: SetlistPost[] = [];
  for (const g of groups) {
    const text = g.map((t) => t.text).join("\n");
    const stages = parseSetlistText(text);
    if (stages.length === 0) continue;
    if (!hasNumberedItems(text) && opts.isKnownSong) {
      const items = stages.flatMap((st) => st.items);
      const known = items.filter(opts.isKnownSong).length;
      if (items.length < 3 || known / items.length < 0.8) continue;
    }
    const base = {
      id: g[0]!.id,
      url: g[0]!.url,
      time: g[0]!.time,
      text,
      tweets: g,
      truncated: g.some((t) => t.truncated),
    };
    const parts = stages.map((s) => (s.name ? partNumber(s.name) : undefined));
    if (stages.length > 1 && parts.every((p) => p !== undefined)) {
      stages.forEach((s, i) => posts.push({ ...base, stages: [{ items: s.items, note: s.note }], part: parts[i] }));
    } else {
      posts.push({ ...base, stages });
    }
  }
  return posts;
}

export type MatchResult =
  | { kind: "matched"; post: SetlistPost; event: ResolvedEvent; reason: string }
  | { kind: "ambiguous"; post: SetlistPost; candidates: ResolvedEvent[] }
  | { kind: "unmatched"; post: SetlistPost };

/** 告知文冒頭に書かれた日付（10/4・2026.10.04 など）を YYYY-MM-DD で返す */
function datesInHeader(text: string, year: string): string[] {
  const head = text.split("\n").slice(0, 6).join("\n").normalize("NFKC");
  const out = new Set<string>();
  for (const m of head.matchAll(/(?:(20\d{2})[./-])?(\d{1,2})[./](\d{1,2})(?!\d)/g)) {
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      out.add(`${m[1] ?? year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
    }
  }
  return [...out];
}

function hashtags(text: string): string[] {
  return [...text.normalize("NFKC").matchAll(/#([^\s#]+)/g)].map((m) => normalizeTitle(m[1]!)).filter((t) => t.length >= 2);
}

/** 告知文の冒頭（最初の曲行より前、ハッシュタグ除く） */
function headerText(text: string): string {
  const lines: string[] = [];
  for (const l of text.split("\n")) {
    if (/^\s*M\s*\d/i.test(l)) break;
    lines.push(l.replace(/#[^\s#]+/g, ""));
  }
  return lines.join(" ");
}

/** 最長共通部分文字列の長さ */
function commonLength(a: string, b: string): number {
  let best = 0;
  const prev = Array.from<number>({ length: b.length + 1 }).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j]! > best) best = prev[j]!;
      diag = tmp;
    }
  }
  return best;
}

function prevDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * セトリ告知をイベントに対応付ける（古い順に処理し、同じイベントには 1 つだけ割り当てる）。
 * manual: { [post.id or `${post.id}#${part}`]: eventId | "skip" } で手動指定できる。
 */
export function matchPosts(
  posts: SetlistPost[],
  events: ResolvedEvent[],
  manual: Record<string, number | "skip"> = {},
  /** 照合時に無視する語（グループ名など、どのイベント名にも入っているもの） */
  ignoreWords: string[] = [],
): MatchResult[] {
  const ignore = ignoreWords.map(normalizeTitle).filter(Boolean);
  const strip = (s: string) => ignore.reduce((acc, w) => acc.replaceAll(w, ""), normalizeTitle(s));
  const live = events.filter(isLiveEvent);
  const assigned = new Set<number>();
  const results: MatchResult[] = [];

  for (const post of [...posts].sort((a, b) => a.time.localeCompare(b.time))) {
    const key = post.part ? `${post.id}#${post.part}` : post.id;
    const m = manual[key];
    if (m === "skip") continue;
    if (typeof m === "number") {
      const ev = events.find((e) => e.id === m);
      if (ev) {
        assigned.add(ev.id);
        results.push({ kind: "matched", post, event: ev, reason: "手動指定" });
        continue;
      }
    }

    const at = toJst(post.time);
    const day = at.slice(0, 10);
    const started = live.filter((e) => !assigned.has(e.id) && `${e.date}T${e.start ?? "00:00"}` <= at);

    // 1) 告知文に日付があればその日、なければ投稿当日 → 前日
    const headerDates = datesInHeader(post.text, day.slice(0, 4));
    let candidates = headerDates.length
      ? started.filter((e) => headerDates.includes(e.date))
      : started.filter((e) => e.date === day);
    if (!headerDates.length && candidates.length === 0) candidates = started.filter((e) => e.date === prevDate(day));

    let reason = headerDates.length ? `本文の日付 ${headerDates.join(",")}` : "投稿日時";

    // 2) 部の指定
    if (post.part !== undefined && candidates.length > 1) {
      const byPart = candidates.filter((e) => partNumber(e.title) === post.part);
      if (byPart.length) {
        candidates = byPart;
        reason += ` + ${post.part}部`;
      }
    }

    // 3) ハッシュタグがイベント名に含まれるか（全候補に当てはまるタグは判別に使わない）
    if (candidates.length > 1) {
      const tags = hashtags(post.text);
      const score = (e: ResolvedEvent) => tags.filter((t) => normalizeTitle(e.title).includes(t)).length;
      const best = Math.max(...candidates.map(score));
      const top = candidates.filter((e) => score(e) === best);
      if (best > 0 && top.length < candidates.length) {
        candidates = top;
        reason += " + ハッシュタグ";
      }
    }

    // 4) 告知文冒頭とイベント名の最長共通部分（3 文字以上で、単独トップのときだけ採用）
    if (candidates.length > 1) {
      const head = strip(headerText(post.text));
      const scored = candidates.map((e) => ({ e, n: commonLength(head, strip(e.title)) }));
      const best = Math.max(...scored.map((s) => s.n));
      const top = scored.filter((s) => s.n === best);
      if (best >= 3 && top.length === 1) {
        candidates = [top[0]!.e];
        reason += " + 告知文の見出し";
      }
    }

    if (candidates.length === 1) {
      assigned.add(candidates[0]!.id);
      results.push({ kind: "matched", post, event: candidates[0]!, reason });
    } else if (candidates.length > 1) {
      results.push({ kind: "ambiguous", post, candidates });
    } else {
      results.push({ kind: "unmatched", post });
    }
  }
  return results;
}
