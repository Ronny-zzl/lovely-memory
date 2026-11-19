import { normalizeTitle, type Song, type SongVideo } from "@lovely-memory/core";

/**
 * 公式 YouTube の動画タイトルから、曲ページに載せる動画を判定する（import-youtube 用の純粋な関数）。
 * タイトルの形（実例）:
 *   太陽と踊れ月夜に唄え「ラブリィフェリス」Music Video
 *   【ライブ映像】太陽と踊れ月夜に唄え「もしも」(2025.07.27 2nd ANNIVERSARY LIVE)
 *   太陽と踊れ「JUNK GAME POP」LIVE VIDEO(2023.12.3 1st ONEMAN BAND LIVE)
 *   【Dance Practice】太陽と踊れ月夜に唄え「NON理論」
 *   太陽と踊れ月夜に唄え「ラブリィフェリス」【歌割動画】 / 月夜に唄え「colorless」【歌い分け試聴】
 */

export type ChannelVideo = { id: string; title: string };

/** 動画の種類。null は曲ページに載せないもの（Teaser・メイキング・企画動画など） */
export function videoKind(title: string): SongVideo["kind"] | null {
  if (/making|メイキング|teaser|tv spot|試聴動画|課題曲/i.test(title)) return null;
  if (/dance practice/i.test(title)) return "dance";
  if (/歌割|歌い分け/.test(title)) return "parts";
  if (/live video|ライブ映像/i.test(title)) return "live";
  if (/music video/i.test(title)) return "mv";
  return null;
}

/** ライブ映像の末尾「(2025.07.27 2nd ANNIVERSARY LIVE)」から公演日と公演名 */
export function liveDateAndLabel(title: string): { date: string; label: string } | undefined {
  const m = title.match(/[(（](\d{4})\.(\d{1,2})\.(\d{1,2})\s+(.+?)[)）]\s*$/);
  if (!m) return undefined;
  return { date: `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`, label: m[4]!.trim() };
}

/** MV の別バージョン名（「Music Video Sakura Edition🌸」→「Sakura Edition」） */
export function mvLabel(title: string): string | undefined {
  const rest = title.match(/music video\s*(.*)$/i)?.[1] ?? "";
  const label = rest.replace(/[^\p{L}\p{N}\s.'’&-]/gu, "").trim();
  return label || undefined;
}

/** タイトルの「」『』の中の曲名と一致する曲 */
export function songsInTitle(title: string, songs: Song[]): Song[] {
  const quoted = new Set([...title.matchAll(/[「『]([^」』]+)[」』]/g)].map((m) => normalizeTitle(m[1]!)));
  return songs.filter((s) => [s.title, ...s.aliases].some((t) => quoted.has(normalizeTitle(t))));
}

export type VideoPlan = {
  /** 追加する動画（date はライブ映像なら決まっている。それ以外は公開日を別に調べて埋める） */
  additions: Array<{ song: Song; video: ChannelVideo; kind: SongVideo["kind"]; date?: string; label?: string }>;
  /** 載せる種類なのに曲が決まらなかった動画（songs.json に無い曲など。手で確認する） */
  unmatched: Array<{ video: ChannelVideo; kind: SongVideo["kind"] }>;
};

/** チャンネルの動画のうち、まだどの曲にも登録されていないものの取り込み計画 */
export function planVideos(videos: ChannelVideo[], songs: Song[]): VideoPlan {
  const known = new Set(songs.flatMap((s) => s.videos.map((v) => v.id)));
  const plan: VideoPlan = { additions: [], unmatched: [] };
  for (const video of videos) {
    if (known.has(video.id)) continue;
    const kind = videoKind(video.title);
    if (!kind) continue;
    const hit = songsInTitle(video.title, songs);
    if (hit.length === 0) {
      plan.unmatched.push({ video, kind });
      continue;
    }
    const live = kind === "live" ? liveDateAndLabel(video.title) : undefined;
    const label = kind === "live" ? live?.label : kind === "mv" ? mvLabel(video.title) : undefined;
    for (const song of hit) plan.additions.push({ song, video, kind, date: live?.date, label });
  }
  return plan;
}
