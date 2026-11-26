import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { artistPath, loadArtist, loadSongs, writeJson } from "../repo.ts";
import { planVideos, type ChannelVideo } from "../youtube.ts";

/**
 * 公式 YouTube チャンネルの動画（MV・ライブ映像・Dance Practice・歌割動画）を songs.json の videos に追加する。
 *
 *   pnpm lm import-youtube <artistId> [--dry-run]
 *
 * yt-dlp で一覧を読む（PATH に無ければ uvx yt-dlp）。登録済みの動画は飛ばすので、何度実行してもよい。
 * 読むのは「動画」タブだけ（ショートは動画の切り抜き、ライブ配信は曲と関係が無い）。
 * 曲が決まらなかった動画（songs.json に無い曲など）は一覧に出すだけなので、曲を追加してから再実行する。
 */
export async function importYoutube(artistId: string, opts: { "dry-run"?: boolean }) {
  const artist = await loadArtist(artistId);
  const channelId = artist.sources.youtube?.channelId;
  if (!channelId) throw new Error(`artist.json に sources.youtube.channelId がありません`);

  const list = await ytDlp([
    "--flat-playlist",
    "--extractor-args",
    "youtube:lang=ja",
    "--print",
    "%(id)s\t%(title)s",
    `https://www.youtube.com/channel/${channelId}/videos`,
  ]);
  const videos: ChannelVideo[] = list
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, ...title] = line.split("\t");
      return { id: id!, title: title.join("\t").trim() };
    });
  console.log(`チャンネルの動画 ${videos.length} 本`);

  const songs = await loadSongs(artistId);
  const plan = planVideos(videos, songs);

  // ライブ映像以外は日付がタイトルに無いので、公開日を調べる（新しく追加するものだけ）
  const needDate = [...new Set(plan.additions.filter((a) => !a.date).map((a) => a.video.id))];
  const uploaded = new Map<string, string>();
  if (needDate.length) {
    const out = await ytDlp([
      "--skip-download",
      "--sleep-requests",
      "1",
      "--print",
      "%(id)s\t%(upload_date)s",
      ...needDate.map((id) => `https://www.youtube.com/watch?v=${id}`),
    ]);
    for (const line of out.split("\n").filter(Boolean)) {
      const [id, d] = line.trim().split("\t");
      if (id && d && /^\d{8}$/.test(d)) uploaded.set(id, `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
    }
  }

  let added = 0;
  for (const a of plan.additions) {
    const date = a.date ?? uploaded.get(a.video.id);
    if (!date) {
      console.warn(`! 日付が分からないので飛ばしました: ${a.video.id} ${a.video.title}`);
      continue;
    }
    a.song.videos.push({ id: a.video.id, kind: a.kind, date, ...(a.label ? { label: a.label } : {}) });
    a.song.videos.sort((x, y) => y.date.localeCompare(x.date));
    added++;
    console.log(`+ ${a.song.title}  ${a.kind} ${date}${a.label ? `（${a.label}）` : ""}  ${a.video.id}`);
  }
  for (const u of plan.unmatched) {
    console.log(
      `? 曲が決まりません（songs.json に無い曲なら pnpm lm song … --new で登録してから再実行）: ${u.kind} ${u.video.id} ${u.video.title}`,
    );
  }

  if (added === 0) {
    console.log("追加する動画はありません");
    return;
  }
  if (opts["dry-run"]) {
    console.log(`（--dry-run のため書き込みません）追加 ${added} 本`);
    return;
  }
  await writeJson(artistPath(artistId, "songs.json"), songs);
  console.log(`songs.json に ${added} 本追加しました`);
}

const run = promisify(execFile);

/** yt-dlp を実行して標準出力を返す。PATH に無ければ uvx yt-dlp（uv が入っていれば別途インストール不要） */
async function ytDlp(args: string[]): Promise<string> {
  const opts = { maxBuffer: 32 * 1024 * 1024 };
  for (const [cmd, pre] of [
    ["yt-dlp", []],
    ["uvx", ["yt-dlp"]],
  ] as const) {
    try {
      return (await run(cmd, [...pre, ...args], opts)).stdout;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      const stderr = (e as { stderr?: string }).stderr?.trim();
      throw new Error(`yt-dlp が失敗しました: ${stderr || String(e)}`, { cause: e });
    }
  }
  throw new Error("yt-dlp が見つかりません。yt-dlp か uv（uvx）をインストールしてください");
}
