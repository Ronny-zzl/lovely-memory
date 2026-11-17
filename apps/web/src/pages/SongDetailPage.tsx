import { Link, useParams } from "react-router";
import { neighbors, positionRole, type Song, type Transition } from "@lovely-memory/core/runtime";
import { TypeBadges } from "../components/TypeBadges.tsx";
import { daysBetween, displayTitle, formatDate, formatPercent, todayJst } from "../format.ts";
import { UnitTag } from "../components/UnitTag.tsx";
import { useArtistData } from "./ArtistLayout.tsx";

const RELEASE_KIND: Record<NonNullable<Song["release"]>["kind"], string> = {
  ep: "EP",
  single: "シングル",
  digital: "配信シングル",
  album: "アルバム",
  other: "",
};

/** 作詞・作曲・編曲のうち同じ人をまとめる（例: 作詞・作曲：カジ / 編曲：tonerico） */
function formatCredits(c: Song["credits"]): string[] {
  if (!c) return [];
  const roles: Array<[string, string | undefined]> = [
    ["作詞", c.lyrics],
    ["作曲", c.music],
    ["編曲", c.arrangement],
  ];
  const groups: Array<{ roles: string[]; name: string }> = [];
  for (const [role, name] of roles) {
    if (!name) continue;
    const g = groups.find((x) => x.name === name);
    g ? g.roles.push(role) : groups.push({ roles: [role], name });
  }
  return groups.map((g) => `${g.roles.join("・")}：${g.name}`);
}

const ZONES = [
  ["early", "前半"],
  ["middle", "中盤"],
  ["late", "後半"],
] as const;

const NEIGHBOR_SIZE = 3;

function NeighborList({ title, items, pick, extra }: { title: string; items: Transition[]; pick: (t: Transition) => Song; extra?: string }) {
  return (
    <div className="neighbor-col">
      <h4 className="neighbor-heading">{title}</h4>
      {items.length === 0 && !extra ? (
        <p className="muted small">—</p>
      ) : (
        <ul className="neighbor-list">
          {items.slice(0, NEIGHBOR_SIZE).map((t) => (
            <li key={pick(t).id}>
              <Link to={`../${pick(t).id}`} relative="path" className="trend-song">
                {pick(t).title}
              </Link>
              <span className="rank-count">{t.count}回</span>
            </li>
          ))}
          {extra && <li className="muted small">{extra}</li>}
        </ul>
      )}
    </div>
  );
}

export function SongDetailPage() {
  const { artist, allStats, patterns } = useArtistData();
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
  const today = todayJst();
  const era = artist.eras.find((e) => e.id === song.era && e.id !== artist.defaultEra);
  const unit = artist.units.find((u) => u.id === song.unit && u.id !== artist.defaultUnit);

  const eventSetlists = new Map(allStats.events.map((e) => [e.event.id, e]));
  const firstIdx = stats.first ? allStats.events.findIndex((e) => e.event.id === stats.first!.eventId) : -1;
  const sinceDebut = firstIdx >= 0 ? allStats.events.slice(firstIdx) : [];
  const sungIn = new Set(stats.performances.map((p) => p.eventId));

  const stageSize = (eventId: number, stageIndex: number) =>
    eventSetlists.get(eventId)?.stages[stageIndex]?.entries.length ?? 0;
  // 本編での位置と前後の曲（コラボステージを除く）
  const position = patterns.positions.find((p) => p.song.id === song.id);
  const role = position && positionRole(position);
  const zoned = position ? position.zones.early + position.zones.middle + position.zones.late : 0;
  const near = neighbors(patterns, song.id);

  const history = [...stats.performances].reverse();
  // カバー曲は歌唱回数が少なく間隔も長いので、歌唱率・出現パターン等は出さない
  const isCover = !!song.cover;

  return (
    <article className="song-detail">
      <Link to=".." relative="path" className="back-link">
        ← 楽曲一覧
      </Link>

      <header className="song-detail-header">
        <h2 className="song-detail-title">
          {song.title}
          {era && <span className={`badge era-${era.id}`}>{era.label}</span>}
          {unit && <UnitTag unit={unit} />}
          {role && <span className="badge role">{role === "closer" ? "ラスト定番" : "1曲目定番"}</span>}
        </h2>
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
      </header>

      {stats.count === 0 ? (
        <p className="muted empty-setlist">記録上、まだ歌われていません。</p>
      ) : (
        <>
          <div className={isCover ? "summary" : "summary summary-4"}>
            <div className="stat">
              <span className="stat-value">{stats.count}</span>
              <span className="stat-label">歌唱回数</span>
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

          {!isCover && (
            <section className="song-section">
              <h3 className="section-heading">
                出現パターン<span className="muted small"> 初披露以降 {sinceDebut.length} 公演（古い順）</span>
              </h3>
              <div className="pattern" role="list">
                {sinceDebut.map(({ event }) => (
                  <Link
                    key={event.id}
                    role="listitem"
                    to={`/${artist.id}/events/${event.id}`}
                    className={sungIn.has(event.id) ? "cell sung" : "cell"}
                    title={`${formatDate(event.date)} ${event.title}${sungIn.has(event.id) ? "" : "（歌唱なし）"}`}
                  />
                ))}
              </div>
            </section>
          )}

          {!isCover && position && position.count > 0 && (
            <section className="song-section">
              <h3 className="section-heading">
                セトリでの位置<span className="muted small"> 本編 {position.count} 回</span>
              </h3>
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
              <p className="small muted position-stats">
                1 曲目 {position.opener} 回 ・ ラスト {position.closer} 回
                {position.encore > 0 && ` ・ アンコール ${position.encore} 回`}
              </p>
              <div className="neighbors">
                <NeighborList title="前に歌われた曲" items={near.before} pick={(t) => t.from} extra={position.opener > 0 ? `1 曲目 ${position.opener}回` : undefined} />
                <NeighborList title="次に歌われた曲" items={near.after} pick={(t) => t.to} extra={position.closer > 0 ? `ラスト ${position.closer}回` : undefined} />
              </div>
            </section>
          )}

          <section className="song-section">
            <h3 className="section-heading">歌唱履歴</h3>
            <ul className="event-list">
              {history.map((p) => {
                const es = eventSetlists.get(p.eventId)!;
                const size = stageSize(p.eventId, p.stageIndex);
                return (
                  <li key={`${p.eventId}-${p.stageIndex}-${p.position}`}>
                    <Link to={`/${artist.id}/events/${p.eventId}`} className="event-row">
                      <span className="event-date event-date-full">{formatDate(p.date)}</span>
                      <span className="event-main">
                        <span className="event-title">
                          <TypeBadges types={es.event.types} />
                          {displayTitle(es.event.title, artist.name)}
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
                        {p.encore ? "EN" : `M${p.position}`}
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
