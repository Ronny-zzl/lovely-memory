import { Link } from "react-router";
import type { Milestone } from "@lovely-memory/core/runtime";
import { milestoneText } from "../format.ts";
import "./MilestoneBadge.css";

/** 節目の印。曲の節目は曲名（曲ページへのリンク）付き。showSong=false なら曲名を省く（曲ページの中など） */
export function MilestoneBadge({ m, artistId, showSong = true }: { m: Milestone; artistId: string; showSong?: boolean }) {
  const song = "song" in m && showSong ? m.song : undefined;
  return (
    <span className={`milestone milestone-${m.kind}`}>
      <span className="milestone-icon" aria-hidden="true">
        {m.kind === "song-return" ? "↺" : m.kind === "song-streak" ? "🔥" : "🎉"}
      </span>
      {song && (
        <Link to={`/${artistId}/songs/${song.id}`} className="milestone-song">
          {song.title}
        </Link>
      )}
      <span>{milestoneText(m)}</span>
    </span>
  );
}
