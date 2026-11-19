import { useState } from "react";
import { VIDEO_KIND_LABEL, type ArtistConfig, type SongVideo } from "@lovely-memory/core/runtime";
import { formatDate } from "../format.ts";
import "./SongVideos.css";

/**
 * 曲ページの「動画」：公式 YouTube の MV・ライブ映像など。
 * 押すまでは YouTube に何も読み込まない（サムネイルも出さない）。押したらその場で埋め込みプレーヤー（youtube-nocookie.com）にする。
 * カードはどれも 2 行（種類／公演名・日付）にそろえ、高さが揃うようにする。長い公演名は 1 行で省略し、全文は title で見せる。
 * 「YouTube で開く」は再生中の動画の下にだけ出す（カードの幅を文字に使うため）
 */
export function SongVideos({ videos, artist }: { videos: SongVideo[]; artist: ArtistConfig }) {
  const [playing, setPlaying] = useState<string | null>(null);
  if (videos.length === 0) return null;
  const sorted = [...videos].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="song-section">
      <h3 className="section-heading">
        動画<span className="muted small"> 公式 YouTube</span>
      </h3>
      <ul className="song-videos">
        {sorted.map((v) => {
          const era = olderEra(v.date, artist);
          const kind = VIDEO_KIND_LABEL[v.kind];
          const date = formatDate(v.date);
          const youtube = (
            <a
              className="song-video-link"
              href={`https://www.youtube.com/watch?v=${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="YouTube で開く"
              aria-label={`${kind}${v.label ? `（${v.label}）` : ""}を YouTube で開く`}
            >
              ↗
            </a>
          );
          const text = (
            <span className="song-video-text">
              <span className="song-video-kind">
                {kind}
                {era && <span className="badge song-video-era">{era}</span>}
              </span>
              {/* 日付は必ず見せ、長い公演名だけを省略する */}
              <span className="song-video-meta muted small" title={v.label ? `${v.label} ・ ${date}` : undefined}>
                {v.label && <span className="song-video-label">{v.label}</span>}
                {v.label && (
                  <span className="song-video-sep" aria-hidden="true">
                    ・
                  </span>
                )}
                <span className="song-video-date">{date}</span>
              </span>
            </span>
          );

          if (playing === v.id) {
            return (
              <li key={v.id} className="song-video is-playing">
                <div className="song-video-frame">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1`}
                    title={`${kind}${v.label ? ` ${v.label}` : ""}`}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
                <div className="song-video-row">
                  <span className="song-video-caption">{text}</span>
                  {youtube}
                </div>
              </li>
            );
          }
          return (
            <li key={v.id} className="song-video">
              <div className="song-video-row">
                <button type="button" className="song-video-card" onClick={() => setPlaying(v.id)}>
                  <span className="song-video-play" aria-hidden="true">
                    ▶
                  </span>
                  {text}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * 今のメンバーになる前（artist.since より前）の映像なら、その時期の名前（例: 「1期曲」→「1期」）。今の映像なら undefined
 */
function olderEra(date: string, artist: ArtistConfig): string | undefined {
  if (!artist.since || date >= artist.since) return undefined;
  const era = artist.eras.filter((e) => e.since && e.since <= date).sort((a, b) => b.since!.localeCompare(a.since!))[0];
  return era ? era.label.replace(/曲$/, "") : "以前のメンバー";
}
