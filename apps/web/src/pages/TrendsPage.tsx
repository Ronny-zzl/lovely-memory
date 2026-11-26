import { Link } from "react-router";
import type { Song, SongPosition } from "@lovely-memory/core/runtime";
import { CostumesSection } from "../components/CostumesSection.tsx";
import { MilestonesSection } from "../components/MilestonesSection.tsx";
import { themeIcons } from "../components/Icons.tsx";
import { formatPercent } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";
import "./TrendsPage.css";

const RANK_SIZE = 5;
const TRANSITION_SIZE = 10;

function SongLink({ song }: { song: Song }) {
  return (
    <Link to={`../songs/${song.id}`} relative="path" className="trend-song">
      {song.title}
    </Link>
  );
}

function PositionRanking({
  title,
  position,
  positions,
  pick,
}: {
  title: string;
  /** 1 曲目はテーマの先頭の飾り（太陽など）、ラストは末尾の飾り（月など） */
  position: "first" | "last";
  positions: SongPosition[];
  pick: (p: SongPosition) => number;
}) {
  const [FirstIcon, LastIcon] = themeIcons(useArtistData().artist.theme);
  const ranked = positions
    .filter((p) => pick(p) > 0)
    .sort((a, b) => pick(b) - pick(a) || pick(b) / b.count - pick(a) / a.count)
    .slice(0, RANK_SIZE);
  return (
    <section className="trend-card">
      <h3 className={`section-heading rank-heading rank-${position}`}>
        <span className="rank-icon">{position === "first" ? <FirstIcon /> : <LastIcon />}</span>
        {title}
      </h3>
      <ol className="rank-list">
        {ranked.map((p, i) => (
          // --share: 本編で歌われたうち、この位置だった割合（行の下の細い帯）
          <li key={p.song.id} className="rank-row" style={{ "--share": pick(p) / p.count } as React.CSSProperties}>
            <span className="rank-no">{i + 1}.</span>
            <SongLink song={p.song} />
            <span className="rank-count">
              {pick(p)}回
              <span className="muted small" title={`本編で歌われた ${p.count} 回のうち`}>
                {" "}
                {formatPercent(pick(p) / p.count)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TrendsPage() {
  const { patterns } = useArtistData();
  const transitions = patterns.transitions.filter((t) => t.count >= 2).slice(0, TRANSITION_SIZE);

  return (
    <div className="trends">
      <h2 className="visually-hidden">セトリの傾向</h2>

      <MilestonesSection />

      <div className="trend-grid">
        <PositionRanking title="1 曲目" position="first" positions={patterns.positions} pick={(p) => p.opener} />
        <PositionRanking title="ラスト" position="last" positions={patterns.positions} pick={(p) => p.closer} />
      </div>

      <section className="song-section">
        <h3 className="section-heading">
          定番の流れ<span className="muted small"> 3 曲以上が同じ順で 3 回以上</span>
        </h3>
        {patterns.chains.length === 0 ? (
          <p className="muted small">まだありません。</p>
        ) : (
          <ul className="chain-list trend-card flow-chains">
            {patterns.chains.map((c) => (
              <li key={c.songs.map((s) => s.id).join(">")}>
                <span className="chain">
                  {c.songs.map((s, i) => (
                    <span key={`${s.id}-${i}`} className="chain-step">
                      {i > 0 && (
                        <span className="arrow" aria-label="の次に">
                          →
                        </span>
                      )}
                      <SongLink song={s} />
                    </span>
                  ))}
                </span>
                <span className="rank-count">{c.count}回</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="song-section">
        <h3 className="section-heading">
          よくあるつながり<span className="muted small"> 続けて歌われた 2 曲（分数は、前の曲の次にこの曲が来た割合）</span>
        </h3>
        <ul className="chain-list trend-card transition-list">
          {transitions.map((t) => (
            <li key={`${t.from.id}>${t.to.id}`}>
              <span className="chain">
                <span className="chain-step">
                  <SongLink song={t.from} />
                </span>
                <span className="chain-step">
                  <span className="arrow" aria-label="の次に">
                    →
                  </span>
                  <SongLink song={t.to} />
                </span>
              </span>
              <span className="rank-count">
                {t.count}回
                <span className="muted small" title={`${t.from.title} の後に曲が続いた ${t.fromCount} 回のうち`}>
                  {" "}
                  {t.count}/{t.fromCount}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <CostumesSection />

      <p className="muted small trends-note">
        セトリのある {patterns.stages} ステージ（コラボステージを除く）から集計。1
        曲目・ラストは本編（アンコールを除く）での位置で、割合は本編でその曲が歌われた回数に対するもの。つながりは本編どうし・アンコールどうしで続いた曲。
      </p>
    </div>
  );
}
