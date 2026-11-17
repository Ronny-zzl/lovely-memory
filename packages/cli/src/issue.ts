import type { ArtistConfig, ResolvedEvent } from "@lovely-memory/core";

/**
 * セトリ入力用 Issue の本文に埋め込むマーカー。
 * ワークフローはこれを読んで、コメントをどのイベントのセトリとして取り込むか決める。
 */
const MARKER = /<!--\s*lovely-memory\s+artist=([a-z0-9-]+)\s+event=(-?\d+)\s*-->/;

export type IssueTarget = { artistId: string; eventId: number };

export function buildMarker(t: IssueTarget): string {
  return `<!-- lovely-memory artist=${t.artistId} event=${t.eventId} -->`;
}

export function parseMarker(body: string): IssueTarget | undefined {
  const m = body.match(MARKER);
  return m ? { artistId: m[1]!, eventId: Number(m[2]) } : undefined;
}

export type CommentDirectives = {
  skip: boolean;
  addUnknown: boolean;
  /** 最初に見つかった X（Twitter）のポスト URL（x.com に正規化） */
  source?: string;
  /** 指示行と URL を取り除いた本文 */
  text: string;
};

const POST_URL = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)\S*/g;

/**
 * Issue コメントを解釈する。
 * - `/skip` `/add-unknown` だけの行は指示として扱い、本文から除く
 * - ポスト URL は出典として取り出し、本文から除く（曲名の列挙形式で曲と誤認しないため）
 */
export function parseComment(body: string): CommentDirectives {
  let skip = false;
  let addUnknown = false;
  let source: string | undefined;
  const lines: string[] = [];

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\/skip$/i.test(line)) {
      skip = true;
      continue;
    }
    if (/^\/add-unknown$/i.test(line)) {
      addUnknown = true;
      continue;
    }
    const withoutUrls = raw.replace(POST_URL, (_m, user: string, id: string) => {
      source ??= `https://x.com/${user}/status/${id}`;
      return "";
    });
    lines.push(withoutUrls);
  }
  return { skip, addUnknown, source, text: lines.join("\n").trim() };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

export function issueTitle(artist: ArtistConfig, e: ResolvedEvent): string {
  return `[セトリ] ${e.date} ${e.title}${artist.subtitle ? ` (${artist.name} ${artist.subtitle})` : ""}`;
}

export function issueBody(artist: ArtistConfig, e: ResolvedEvent, siteUrl?: string): string {
  const times = [e.open && `開場 ${e.open}`, e.start && `開演 ${e.start}`].filter(Boolean).join(" / ");
  const links = [
    e.id > 0 && `[イベンターノート](https://www.eventernote.com/events/${e.id})`,
    siteUrl && `[サイトの公演ページ](${siteUrl}#/${artist.id}/events/${e.id})`,
  ].filter(Boolean);
  return [
    buildMarker({ artistId: artist.id, eventId: e.id }),
    `**${e.date} (${weekday(e.date)})** ${times}`,
    e.venue ? `会場: ${e.venue.name}` : "",
    links.join(" ・ "),
    "",
    "---",
    "",
    "公式のセトリ告知ポストの本文を、この Issue に**コメントとして貼り付ける**と自動で取り込みます。",
    "",
    "- ポストの URL も一緒に貼ると出典として記録されます",
    "- 取り込めると結果を返信して Issue を閉じます。エラーの場合は理由を返信します（修正して再コメント）",
    "- 曲名が songs.json に無い場合: 新曲なら `/add-unknown` の行を付けて再コメント",
    "- セトリが無い・中止などの場合: `/skip` とコメント",
    "- 取り込み後に修正したいときは、閉じた後でも再度コメントすれば上書きします",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}
