import { Link, useParams } from "react-router";
import { formatCredits, isDance, neighbors, positionRole, STREAK_MIN, type Song, type Transition } from "@lovely-memory/core/runtime";
import { MilestoneBadge } from "../components/MilestoneBadge.tsx";
import { ShareButtons } from "../components/ShareButtons.tsx";
import { SongVideos } from "../components/SongVideos.tsx";
import { TypeBadges } from "../components/TypeBadges.tsx";
import { daysBetween, displayTitle, formatDate, formatPercent, POSITION_ROLE_LABEL, tieupLabels, tieupText } from "../format.ts";
import { UnitTag } from "../components/UnitTag.tsx";
import { useArtistData } from "./ArtistLayout.tsx";
import "./SongDetailPage.css";

const RELEASE_KIND: Record<NonNullable<Song["release"]>["kind"], string> = {
  ep: "EP",
  single: "シングル",
  digital: "配信シングル",
  album: "アルバム",
  other: "",
};

const ZONES = [
  ["early", "前半"],
  ["middle", "中盤"],
  ["late", "後半"],
] as const;

const NEIGHBOR_SIZE = 3;
/** 記録（節目）は新しいものをこの件数だけ出し、残りは畳む */
const RECENT_MILESTONES = 3;

/** 前後に歌われた曲の列（多い順）。曲名のすぐ後ろに回数を置く */
function NeighborList({
  title,
  items,
  pick,
  side,
}: {
  title: string;
  items: Transition[];
  pick: (t: Transition) => Song;
  side: "before" | "after";
}) {
  return (
    <div className={`flow-col flow-${side}`}>
      <h4 className="neighbor-heading">{title}</h4>
      {items.length === 0 ? (
        <p className="muted small">—</p>
      ) : (
        <ul className="flow-list">
          {items.slice(0, NEIGHBOR_SIZE).map((t) => (
            <li key={pick(t).id}>
              <Link to={`../${pick(t).id}`} relative="path" className="trend-song">
                {pick(t).title}
              </Link>
              <span className="flow-count">{t.count}回</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SongDetailPage() {
  const { artist, allStats, patterns, milestones, today } = useArtistData();
  const songId = useParams().songId;
  const stats = allStats.songs.find((s) => s.song.id === songId);

  if (!stats) {
    return (
      <p className="muted">
        曲が見つかりません。<Link to="..">楽曲一覧へ</Link>
      </p>
    );
  }

  const { song } = stats;
  const era = artist.eras.find((e) => e.id === song.era && e.id !== artist.defaultEra);
  const unit = artist.units.find((u) => u.id === song.unit && u.id !== artist.defaultUnit);

  const eventSetlists = new Map(allStats.events.map((e) => [e.event.id, e]));
  const firstIdx = stats.first ? allStats.events.findIndex((e) => e.event.id === stats.first!.eventId) : -1;
  const sinceDebut = firstIdx >= 0 ? allStats.events.slice(firstIdx) : [];
  const sungIn = new Set(stats.performances.map((p) => p.eventId));

  const stageSize = (eventId: number, stageIndex: number) => eventSetlists.get(eventId)?.stages[stageIndex]?.entries.length ?? 0;
  // 本編での位置と前後の曲（コラボステージを除く）
  const position = patterns.positions.find((p) => p.song.id === song.id);
  const role = position && positionRole(position);
  const zoned = position ? position.zones.early + position.zones.middle + position.zones.late : 0;
  const near = neighbors(patterns, song.id);
  const record = milestones.songs.get(song.id);
  const songMilestones = milestones.achieved.filter((m) => "song" in m && m.song.id === song.id).reverse();
  const eventTitle = new Map(allStats.events.map((e) => [e.event.id, displayTitle(e.event.title, artist.name)]));
  const milestoneList = (items: typeof songMilestones) => (
    <ul className="milestone-list">
      {items.map((m, i) => (
        <li key={i}>
          <span className="event-date event-date-full">{formatDate(m.date)}</span>
          <MilestoneBadge m={m} artistId={artist.id} showSong={false} />
          {m.eventId && (
            <Link to={`/${artist.id}/events/${m.eventId}`} className="muted small milestone-event">
              {eventTitle.get(m.eventId)}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );

  const history = [...stats.performances].reverse();
  // カバー曲は歌唱回数が少なく間隔も長いので、歌唱率・出現パターン等は出さない。ダンスなど歌ではないものも同じ
  const dance = isDance(song);
  const isCover = !!song.cover || dance;

  return (
    <article className="song-detail">
      <Link to=".." relative="path" className="back-link">
        ← 楽曲一覧
      </Link>

      <header className="song-detail-header">
        <h2 className="song-detail-title">
          {song.title}
          {isDance(song) && <span className="badge">ダンス</span>}
          {era && <span className={`badge era-${era.id}`}>{era.label}</span>}
          {unit && <UnitTag unit={unit} />}
          {tieupLabels(song.tieups).map((l) => (
            <span key={l} className="badge tieup">
              {l}
            </span>
          ))}
          {role && <span className="badge role">{POSITION_ROLE_LABEL[role]}</span>}
        </h2>
        {song.tieups.map((t) => (
          <p key={`${t.type}-${t.work}`} className="small tieup-line">
            {t.url ? (
              <a href={t.url} target="_blank" rel="noopener noreferrer">
                {tieupText(t)}
              </a>
            ) : (
              tieupText(t)
            )}
          </p>
        ))}
        {song.cover && (
          <p className="small">
            カバー曲 ・ 原曲: {song.cover.artist}
            {song.cover.title && `「${song.cover.title}」`}
            {song.cover.release && (
              <span className="muted">
                {" "}
                （
                {song.cover.release.url ? (
                  <a href={song.cover.release.url} target="_blank" rel="noopener noreferrer">
                    {song.cover.release.title ? `「${song.cover.release.title}」` : "配信"}
                  </a>
                ) : (
                  song.cover.release.title && `「${song.cover.release.title}」`
                )}{" "}
                {formatDate(song.cover.release.date)}）
              </span>
            )}
          </p>
        )}
        {formatCredits(song.credits).map((line) => (
          <p key={line} className="credit small">
            {line}
          </p>
        ))}
        {song.release && (
          <p className="small muted">
            収録:{" "}
            {song.release.url ? (
              <a href={song.release.url} target="_blank" rel="noopener noreferrer">
                「{song.release.title}」
              </a>
            ) : (
              `「${song.release.title}」`
            )}{" "}
            {RELEASE_KIND[song.release.kind]} {formatDate(song.release.date)}
          </p>
        )}
        {song.note && <p className="small">{song.note}</p>}
        <ShareButtons
          text={
            stats.count === 0 || isCover
              ? `「${song.title}」の${dance ? "披露" : "歌唱"}記録（${artist.name}）`
              : `「${song.title}」の歌唱率 ${formatPercent(stats.rate)}（${stats.events}/${stats.eligibleEvents} イベント）・歌唱 ${stats.count} 回（${artist.name}）`
          }
          hashtags={artist.shareHashtags}
          image={{ src: `/og/${artist.id}/songs/${song.id}.png`, fileName: `${song.title}.png`, alt: `「${song.title}」の歌唱記録` }}
        />
      </header>

      {stats.count === 0 ? (
        <>
          <p className="muted empty-setlist">記録上、まだ歌われていません。</p>
          <SongVideos videos={song.videos} artist={artist} />
        </>
      ) : (
        <>
          <div className={isCover ? "summary" : "summary summary-4"}>
            <div className="stat">
              <span className="stat-value">{stats.count}</span>
              <span className="stat-label">{dance ? "披露回数" : "歌唱回数"}</span>
            </div>
            {!isCover && (
              <div className="stat">
                <span className="stat-value">
                  {formatPercent(stats.rate)}
                  <span className="stat-total">
                    {" "}
                    {stats.events}/{stats.eligibleEvents}
                  </span>
                </span>
                <span className="stat-label">歌唱率（初披露以降）</span>
              </div>
            )}
            <div className="stat">
              <span className="stat-value stat-date">{formatDate(stats.first!.date)}</span>
              <Link to={`/${artist.id}/events/${stats.first!.eventId}`} className="stat-label stat-link">
                初披露 →
              </Link>
            </div>
            <div className="stat">
              <span className="stat-value stat-date">{formatDate(stats.last!.date)}</span>
              <Link to={`/${artist.id}/events/${stats.last!.eventId}`} className="stat-label stat-link">
                最終（{daysBetween(stats.last!.date, today)}日前）→
              </Link>
            </div>
          </div>

          <SongVideos videos={song.videos} artist={artist} />

          {!isCover && (
            <section className="song-section">
              <h3 className="section-heading">
                出現パターン<span className="muted small"> 初披露以降 {sinceDebut.length} イベント（古い順）</span>
              </h3>
              <ol className="pattern">
                {sinceDebut.map(({ event }) => {
                  const label = `${formatDate(event.date)} ${event.title}${sungIn.has(event.id) ? "" : "（歌唱なし）"}`;
                  return (
                    <li key={event.id}>
                      <Link
                        to={`/${artist.id}/events/${event.id}`}
                        className={sungIn.has(event.id) ? "cell sung" : "cell"}
                        title={label}
                        aria-label={label}
                      />
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {!isCover && record && (
            <section className="song-section song-card">
              <h3 className="section-heading">記録</h3>
              <ul className="record-facts">
                {record.currentStreak >= STREAK_MIN && (
                  <li>
                    <span aria-hidden="true">🔥</span> いま <strong>{record.currentStreak} 回連続</strong>で歌唱中
                  </li>
                )}
                {record.longestStreak >= 2 && record.longestStreak > record.currentStreak && (
                  <li>
                    最長 <strong>{record.longestStreak} 回連続</strong>
                    <span className="muted small">（〜{formatDate(record.longestStreakEnd!.date)}）</span>
                  </li>
                )}
                <li>
                  あと <strong>{record.nextCount - stats.count} 回</strong>で通算 {record.nextCount} 回目
                </li>
              </ul>
              {songMilestones.length > 0 && milestoneList(songMilestones.slice(0, RECENT_MILESTONES))}
              {songMilestones.length > RECENT_MILESTONES && (
                <details className="older-records">
                  <summary className="small">それ以前の記録（{songMilestones.length - RECENT_MILESTONES} 件）</summary>
                  {milestoneList(songMilestones.slice(RECENT_MILESTONES))}
                </details>
              )}
            </section>
          )}

          {!isCover && position && position.count > 0 && (
            <section className="song-section song-card">
              <h3 className="section-heading">
                セトリでの位置<span className="muted small"> 本編 {position.count} 回</span>
              </h3>
              {/* 本編の始まり（1 曲目）から終わり（ラスト）まで。前半・中盤・後半は朝・夕方・夜の色 */}
              <div className="position-ends small">
                <span>
                  1 曲目 <strong>{position.opener}</strong> 回
                </span>
                <span>
                  ラスト <strong>{position.closer}</strong> 回
                </span>
              </div>
              {zoned > 0 && (
                <div className="zone-bar" role="img" aria-label={ZONES.map(([z, label]) => `${label} ${position.zones[z]}回`).join("、")}>
                  {ZONES.map(([z, label]) =>
                    position.zones[z] > 0 ? (
                      <span key={z} className={`zone zone-${z}`} style={{ flexGrow: position.zones[z] }}>
                        {label} {position.zones[z]}
                      </span>
                    ) : null,
                  )}
                </div>
              )}
              {position.encore > 0 && <p className="small muted position-stats">アンコール {position.encore} 回</p>}
              <div className="flow">
                <NeighborList title="前に歌われた曲" items={near.before} pick={(t) => t.from} side="before" />
                <span className="flow-arrow" aria-hidden="true">
                  →
                </span>
                <span className="flow-song">{song.title}</span>
                <span className="flow-arrow" aria-hidden="true">
                  →
                </span>
                <NeighborList title="次に歌われた曲" items={near.after} pick={(t) => t.to} side="after" />
              </div>
            </section>
          )}

          <section className="song-section">
            <h3 className="section-heading">{dance ? "披露履歴" : "歌唱履歴"}</h3>
            <ul className="event-list">
              {history.map((p) => {
                const es = eventSetlists.get(p.eventId)!;
                const size = stageSize(p.eventId, p.stageIndex);
                return (
                  <li key={`${p.eventId}-${p.stageIndex}-${p.position}`}>
                    <Link to={`/${artist.id}/events/${p.eventId}`} className="event-row event-row-stacked">
                      <span className="event-date event-date-full">{formatDate(p.date)}</span>
                      <span className="event-main">
                        <span className="event-title">
                          <span className="event-badges">
                            <TypeBadges types={es.event.types} />
                          </span>
                          <span className="event-name">{displayTitle(es.event.title, artist.name)}</span>
                        </span>
                        <span className="event-meta">
                          {p.collab && <span className="badge collab">コラボ</span>}
                          {p.stageName && <span>{p.stageName}</span>}
                          {p.with && <span>with {p.with.join("・")}</span>}
                          {p.note && <span>{p.note}</span>}
                          {p.debut && <span className="debut-count">初披露</span>}
                        </span>
                      </span>
                      <span className="position" title={`${size} 曲中 ${p.position} 曲目`}>
                        {p.no}
                        <span className="muted"> / {size}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </article>
  );
}
