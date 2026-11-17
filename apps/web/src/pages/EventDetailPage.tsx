import { Link, useParams } from "react-router";
import { isLiveEvent } from "@lovely-memory/core";
import { MemberDots } from "../components/MemberDots.tsx";
import { TypeBadges } from "../components/TypeBadges.tsx";
import { displayTitle, eventernoteUrl, formatDate, formatDayWithWeekday } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";

export function EventDetailPage() {
  const { artist, events, allStats } = useArtistData();
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
        {event.note && <p className="small">{event.note}</p>}
      </header>

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
              <ol className="setlist-items">
                {stage.entries.map((e, i) => {
                  // 公演の出演メンバーと違う場合だけ（ユニット曲・一部メンバー曲など）表示する
                  const partial =
                    e.members.length !== event.members.length || e.members.some((m) => !event.members.includes(m));
                  return (
                    <li key={i} className={e.encore ? "encore" : undefined}>
                      <span className="item-no">{e.encore ? "EN" : `M${e.position}`}</span>
                      <Link to={`/${artist.id}/songs/${e.song.id}`} className="item-title">
                        {e.song.title}
                      </Link>
                      {e.debut && (
                        <span className="badge debut" title="記録上の初披露">
                          初披露
                        </span>
                      )}
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
            </div>
          ))}
          {setlist.note && <p className="setlist-note small">{setlist.note}</p>}
        </section>
      ) : (
        <p className="muted empty-setlist">
          {!isLiveEvent(event) ? "ライブの無いイベントです" : "セトリはまだ登録されていません"}
        </p>
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
