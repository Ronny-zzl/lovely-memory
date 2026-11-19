import { Link, useParams } from "react-router";
import { Fragment } from "react";
import { birthdayMembers, eventCostume, isLiveEvent } from "@lovely-memory/core/runtime";
import { MemberDots } from "../components/MemberDots.tsx";
import { MilestoneBadge } from "../components/MilestoneBadge.tsx";
import { AttendanceToggle } from "../components/AttendanceToggle.tsx";
import { ShareButtons } from "../components/ShareButtons.tsx";
import { TypeBadges } from "../components/TypeBadges.tsx";
import { displayTitle, eventernoteUrl, formatDate, formatDayWithWeekday } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";
import "./EventDetailPage.css";

export function EventDetailPage() {
  const { artist, events, allStats, milestones, isHeld } = useArtistData();
  const id = Number(useParams().eventId);
  const event = events.find((e) => e.id === id);

  if (!event) {
    return (
      <p className="muted">
        公演が見つかりません。<Link to="..">公演一覧へ</Link>
      </p>
    );
  }

  const setlist = allStats.events.find((e) => e.event.id === id);
  // 前後の公演（特典会を除く）
  const live = events.filter(isLiveEvent);
  const idx = live.findIndex((e) => e.id === id);
  const prev = idx > 0 ? live[idx - 1] : undefined;
  const next = idx >= 0 && idx < live.length - 1 ? live[idx + 1] : undefined;

  const memberName = new Map(artist.members.map((m) => [m.id, m.name]));
  const absent = artist.members.filter((m) => !event.members.includes(m.id));
  const times = [event.open && `開場 ${event.open}`, event.start && `開演 ${event.start}`].filter(Boolean).join(" / ");
  const enUrl = eventernoteUrl(event.id);
  const multiStage = (setlist?.stages.length ?? 0) > 1;
  // この公演で達成した節目（グループの記録を先に）
  const birthdays = birthdayMembers(artist.members, event.date);
  const costume = eventCostume(artist, event, isHeld(event));
  const reached = milestones.achieved.filter((m) => m.eventId === id).sort((a, b) => Number("song" in a) - Number("song" in b));

  return (
    <article className="event-detail">
      <Link to=".." relative="path" className="back-link">
        ← 公演一覧
      </Link>

      <header className="event-detail-header">
        <p className="event-detail-date">
          {event.date.slice(0, 4)}.{formatDayWithWeekday(event.date)}
          {times && <span className="muted"> {times}</span>}
        </p>
        <h2 className="event-detail-title">{event.title}</h2>
        <p className="event-detail-meta">
          <TypeBadges types={event.types} />
          {event.venue && <span>{event.venue.name}</span>}
        </p>
        <p className="event-detail-members">
          <MemberDots artist={artist} present={event.members} />
          {event.membersSource === "assumed" ? (
            <span className="muted small">出演メンバー情報なし（全員出演として表示）</span>
          ) : absent.length ? (
            <span className="small">欠席: {absent.map((m) => m.name).join("・")}</span>
          ) : (
            <span className="small muted">全員出演</span>
          )}
        </p>
        {costume && (
          <p className={`event-costume small${costume.special ? " special" : ""}`}>
            <span className="muted">衣装</span> {costume.name}
          </p>
        )}
        {event.note && <p className="small">{event.note}</p>}
        <div className="detail-actions">
          {isLiveEvent(event) && <AttendanceToggle eventId={event.id} upcoming={!isHeld(event)} variant="detail" />}
        </div>
        <ShareButtons
          text={`${formatDate(event.date)}「${displayTitle(event.title, artist.name)}」${setlist ? "のセトリ" : ""}（${artist.name}）`}
          hashtags={artist.shareHashtags}
          // 共有画像はライブのイベントにだけある（og-pages）
          image={
            isLiveEvent(event)
              ? {
                  src: `/og/${artist.id}/events/${event.id}.png`,
                  fileName: `${event.date} ${displayTitle(event.title, artist.name)}.png`,
                  alt: `${formatDate(event.date)}「${displayTitle(event.title, artist.name)}」のセットリスト`,
                }
              : undefined
          }
        />
      </header>

      {(reached.length > 0 || birthdays.length > 0) && (
        <section className="event-milestones">
          <h3 className="section-heading">この公演の記録</h3>
          <div className="milestones">
            {birthdays.map((m) => (
              <span key={m.id} className="milestone milestone-birthday">
                <span className="milestone-icon" aria-hidden="true">
                  🎂
                </span>
                <span className="dot" style={{ background: m.color }} />
                {m.name}の誕生日
              </span>
            ))}
            {reached.map((m, i) => (
              <MilestoneBadge key={i} m={m} artistId={artist.id} />
            ))}
          </div>
        </section>
      )}

      {setlist ? (
        <section className="setlist">
          {setlist.stages.map((stage, si) => (
            <div key={si} className="setlist-stage">
              {(multiStage || stage.name) && (
                <h3 className="stage-name">
                  {stage.name ?? `ステージ ${si + 1}`}
                  {stage.collab && <span className="badge collab">コラボ</span>}
                  {stage.note && <span className="stage-note">{stage.note}</span>}
                </h3>
              )}
              {[stage.entries.filter((e) => !e.encore), stage.entries.filter((e) => e.encore)].map(
                (entries, part) =>
                  entries.length > 0 && (
                    <Fragment key={part}>
                      {part === 1 && <h4 className="encore-heading">アンコール</h4>}
                      <ol className="setlist-items">
                        {entries.map((e) => {
                          // 公演の出演メンバーと違う場合だけ（ユニット曲・一部メンバー曲など）表示する
                          const partial = e.members.length !== event.members.length || e.members.some((m) => !event.members.includes(m));
                          return (
                            <li key={e.position} className={e.encore ? "encore" : undefined}>
                              <span className="item-no">{e.no}</span>
                              <Link to={`/${artist.id}/songs/${e.song.id}`} className="item-title">
                                {e.song.title}
                              </Link>
                              {e.debut && (
                                <span className="badge debut" title="記録上の初披露">
                                  初披露
                                </span>
                              )}
                              {e.song.cover && <span className="item-note">カバー（原曲: {e.song.cover.artist}）</span>}
                              {e.note && <span className="item-note">{e.note}</span>}
                              {e.with && <span className="item-with">with {e.with.join("・")}</span>}
                              {partial && (
                                <span className="item-members" title={e.members.map((m) => memberName.get(m)).join("・")}>
                                  <MemberDots artist={artist} present={e.members} />
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </Fragment>
                  ),
              )}
            </div>
          ))}
          {setlist.note && <p className="setlist-note small">{setlist.note}</p>}
        </section>
      ) : (
        <p className="muted empty-setlist">{!isLiveEvent(event) ? "ライブの無いイベントです" : "セトリはまだ登録されていません"}</p>
      )}

      <p className="event-links small">
        {setlist?.source && (
          <a href={setlist.source} target="_blank" rel="noopener noreferrer">
            セトリ告知ポスト
          </a>
        )}
        {enUrl && (
          <a href={enUrl} target="_blank" rel="noopener noreferrer">
            イベンターノート
          </a>
        )}
      </p>

      <nav className="event-nav">
        {prev ? (
          <Link to={`../${prev.id}`} relative="path">
            <span className="nav-date">← {formatDate(prev.date)}</span>
            <span className="nav-title">{displayTitle(prev.title, artist.name)}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`../${next.id}`} relative="path" className="nav-next">
            <span className="nav-date">{formatDate(next.date)} →</span>
            <span className="nav-title">{displayTitle(next.title, artist.name)}</span>
          </Link>
        )}
      </nav>
    </article>
  );
}
