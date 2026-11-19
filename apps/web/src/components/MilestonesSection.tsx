import { Link } from "react-router";
import { isLiveEvent, upcomingBirthdays, upcomingMilestones, type Milestone, type UpcomingMilestone } from "@lovely-memory/core/runtime";
import {
  birthdayCountdown,
  daysBetween,
  displayTitle,
  formatDate,
  formatDayWithWeekday,
  formatMonthDay,
  formatPercent,
  todayJst,
} from "../format.ts";
import { useArtistData } from "../pages/ArtistLayout.tsx";
import { MilestoneBadge } from "./MilestoneBadge.tsx";
import "./MilestonesSection.css";

/** 最近の記録として最初から見せる日数（公演のあった日）。それより前はたたんでおく */
const RECENT_DATES = 5;

function Upcoming({ u, artistId, artistName }: { u: UpcomingMilestone; artistId: string; artistName: string }) {
  const song = (s: { id: string; title: string }) => (
    <Link to={`/${artistId}/songs/${s.id}`} className="trend-song">
      {s.title}
    </Link>
  );
  switch (u.kind) {
    case "song-count":
      return (
        <>
          {song(u.song)}
          <span>
            あと <strong>{u.remaining} 回</strong>で通算 {u.count} 回目
          </span>
          <span className="muted small">歌唱率 {formatPercent(u.rate)}</span>
        </>
      );
    case "song-streak":
      return (
        <>
          {song(u.song)}
          <span>
            次も歌われれば <strong>{u.streak} 公演連続</strong>
          </span>
          <span className="muted small">歌唱率 {formatPercent(u.rate)}</span>
        </>
      );
    case "event-count":
      return (
        <>
          <span>
            次の公演で<strong>通算 {u.count} 公演目</strong>
          </span>
          <Link to={`/${artistId}/events/${u.event.id}`} className="muted small">
            {formatDayWithWeekday(u.event.date)} {displayTitle(u.event.title, artistName)}
          </Link>
        </>
      );
    case "total-songs":
      return (
        <span>
          あと <strong>{u.remaining} 曲</strong>で通算 {u.count} 曲
        </span>
      );
    case "debut-days":
      return (
        <>
          <span>
            <strong>{u.years ? `デビュー ${u.years} 周年` : `デビュー ${u.days} 日`}</strong>
          </span>
          <span className="muted small">
            {formatDate(u.date)}（あと {daysBetween(todayJst(), u.date)} 日）
          </span>
        </>
      );
  }
}

function History({
  items,
  artistId,
  artistName,
  titles,
}: {
  items: Milestone[];
  artistId: string;
  artistName: string;
  titles: Map<number, string>;
}) {
  // 日付ごとにまとめる（新しい順）
  const byDate = new Map<string, Milestone[]>();
  for (const m of [...items].reverse()) byDate.set(m.date, [...(byDate.get(m.date) ?? []), m]);
  return (
    <ul className="milestone-days">
      {[...byDate].map(([date, ms]) => {
        const eventId = ms.find((m) => m.eventId)?.eventId;
        return (
          <li key={date}>
            <div className="milestone-day-head">
              <span className="event-date">{formatDayWithWeekday(date)}</span>
              {eventId && (
                <Link to={`/${artistId}/events/${eventId}`} className="muted small">
                  {displayTitle(titles.get(eventId) ?? "", artistName)}
                </Link>
              )}
            </div>
            <div className="milestones">
              {ms.map((m, i) => (
                <MilestoneBadge key={i} m={m} artistId={artistId} />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 傾向タブの「マイルストーン」：これから達成しそうなもの・最近達成したもの・これまでの記録 */
export function MilestonesSection() {
  const { artist, events, allStats, milestones, isHeld } = useArtistData();
  const today = todayJst();
  const live = events.filter(isLiveEvent);
  const upcoming = upcomingMilestones({ milestones, stats: allStats, liveEvents: live, since: artist.since, today, held: isHeld });
  const dates = [...new Set(milestones.achieved.map((m) => m.date))];
  const cut = dates.at(-RECENT_DATES) ?? "";
  const recent = milestones.achieved.filter((m) => m.date >= cut);
  const older = milestones.achieved.filter((m) => m.date < cut);
  const titles = new Map(events.map((e) => [e.id, e.title]));
  const birthdays = upcomingBirthdays(artist.members, today).filter((b) => b.days <= 45);

  return (
    <section className="song-section milestones-section">
      <h3 className="section-heading">マイルストーン</h3>
      {(upcoming.length > 0 || birthdays.length > 0) && (
        <div className="trend-card">
          <h4 className="neighbor-heading">もうすぐ</h4>
          <ul className="upcoming-list">
            {birthdays.map((b) => (
              <li key={b.member.id}>
                <span>
                  <span aria-hidden="true">🎂 </span>
                  <span className="dot" style={{ background: b.member.color }} />
                  <strong>{b.member.name}</strong>の{b.age}歳の誕生日
                </span>
                <span className="muted small">
                  {formatMonthDay(b.date)}（{birthdayCountdown(b.days)}）
                </span>
              </li>
            ))}
            {upcoming.map((u, i) => (
              <li key={i}>
                <Upcoming u={u} artistId={artist.id} artistName={artist.name} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="trend-card">
        <h4 className="neighbor-heading">最近の記録</h4>
        {recent.length > 0 ? (
          <History items={recent} artistId={artist.id} artistName={artist.name} titles={titles} />
        ) : (
          <p className="muted small">ありません。</p>
        )}
        {older.length > 0 && (
          <details className="milestone-all">
            <summary className="small">それ以前の記録（{older.length} 件）</summary>
            <History items={older} artistId={artist.id} artistName={artist.name} titles={titles} />
          </details>
        )}
      </div>
    </section>
  );
}
