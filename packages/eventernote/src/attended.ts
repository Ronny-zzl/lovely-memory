/*
 * eventernote のユーザーの「参加イベント」（https://www.eventernote.com/users/<name>/events）。
 * Cloudflare の Worker でも動かすため、cheerio を使わず必要な値（イベント ID と日付）だけを取り出す。
 * 一覧は開催日の新しい順で、これから参加予定のイベントも含む。
 */

export const ATTENDED_BASE_URL = "https://www.eventernote.com";

/** eventernote のユーザー名として受け付ける形（URL に埋め込むので厳しめに） */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export type AttendedEvent = { id: number; date: string };

export function attendedUrl(user: string, page = 1): string {
  return `${ATTENDED_BASE_URL}/users/${encodeURIComponent(user)}/events${page > 1 ? `?page=${page}` : ""}`;
}

/** 1 ページ分。各イベントは <div class="date"> の日付と、その後の /events/<id> のリンク */
export function parseAttendedPage(html: string): { events: AttendedEvent[]; hasNext: boolean } {
  const start = html.indexOf("gb_event_list");
  const body = start >= 0 ? html.slice(start) : html;
  const events: AttendedEvent[] = [];
  for (const block of body.split('<div class="date">').slice(1)) {
    const date = block.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    const id = block.match(/href="\/events\/(\d+)"/)?.[1];
    if (date && id) events.push({ id: Number(id), date });
  }
  // 最後のページでは「次へ」がリンクにならない
  const hasNext = /<li class=["']?next["']?>\s*<a /.test(html);
  return { events, hasNext };
}

export class AttendedError extends Error {
  readonly status: "invalid" | "not-found" | "upstream";
  constructor(status: AttendedError["status"], message: string) {
    super(message);
    this.status = status;
  }
}

export type FetchAttendedOptions = {
  /** これより前（YYYY-MM-DD）のイベントは要らない。新しい順なので、ここまで来たら読むのをやめる */
  since: string;
  fetch?: typeof fetch;
  userAgent?: string;
  /** 読むページ数の上限（1 ページ 30 件） */
  maxPages?: number;
  /** ページ間の待ち時間（相手のサーバーへの配慮） */
  delayMs?: number;
};

export async function fetchAttended(
  user: string,
  opts: FetchAttendedOptions,
): Promise<{ events: AttendedEvent[]; pages: number; truncated: boolean }> {
  if (!USERNAME_PATTERN.test(user)) throw new AttendedError("invalid", "ユーザー名の形式が正しくありません");
  const doFetch = opts.fetch ?? fetch;
  const maxPages = opts.maxPages ?? 10;
  const events: AttendedEvent[] = [];
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1 && opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    const res = await doFetch(attendedUrl(user, page), {
      headers: opts.userAgent ? { "user-agent": opts.userAgent } : undefined,
      redirect: "follow",
    });
    if (res.status === 404) throw new AttendedError("not-found", `eventernote にユーザー「${user}」が見つかりません`);
    if (!res.ok) throw new AttendedError("upstream", `eventernote から読み込めませんでした（HTTP ${res.status}）`);
    const { events: found, hasNext } = parseAttendedPage(await res.text());
    events.push(...found.filter((e) => e.date >= opts.since));
    const reachedSince = found.some((e) => e.date < opts.since);
    if (!hasNext || reachedSince || found.length === 0) return { events, pages: page, truncated: false };
  }
  return { events, pages: maxPages, truncated: true };
}
