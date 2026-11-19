import { useMemo } from "react";
import { Link } from "react-router";
import { ageOn, computeMemberStats, isLiveEvent, nextBirthday, upcomingBirthdays } from "@lovely-memory/core/runtime";
import { birthdayCountdown, birthdayWithAge, displayTitle, formatDate, formatMonthDay, formatPercent, todayJst } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";
import "./MembersPage.css";

export function MembersPage() {
  const { artist, events, allStats, isHeld } = useArtistData();
  const today = todayJst();
  const members = useMemo(() => computeMemberStats({ artist, events, stats: allStats, held: isHeld }), [artist, events, allStats, isHeld]);
  const assumed = events.filter((e) => isLiveEvent(e) && isHeld(e) && e.membersSource === "assumed").length;

  const soonest = upcomingBirthdays(artist.members, today)[0];

  return (
    <section className="members">
      {soonest && (
        <p className="next-birthday">
          <span aria-hidden="true">🎂</span> 次の誕生日：
          <span className="dot" style={{ background: soonest.member.color }} />
          <strong>{soonest.member.name}</strong> {formatMonthDay(soonest.date)}
          <span className={soonest.days === 0 ? "birthday-today" : "muted"}>（{birthdayWithAge(soonest)}）</span>
        </p>
      )}
      <ul className="member-cards">
        {members.map((s) => (
          <li key={s.member.id} className="member-card" style={{ "--member": s.member.color } as React.CSSProperties}>
            <h2 className="member-name">
              <span className="dot" style={{ background: s.member.color }} />
              {s.member.name}
              {s.member.colorName && <span className="muted small">{s.member.colorName}</span>}
            </h2>
            {(() => {
              const b = nextBirthday(s.member, today);
              return (
                b && (
                  <p className={`member-birthday${b.days === 0 ? " birthday-today" : ""}`}>
                    <span aria-hidden="true">🎂</span> {formatMonthDay(b.date)} ・ {ageOn(s.member.birthday!, today)}歳
                    <span className="muted">（{birthdayCountdown(b.days)}）</span>
                  </p>
                )
              );
            })()}

            <dl className="member-figures">
              <div>
                <dt>出演率</dt>
                <dd>
                  {formatPercent(s.rate)}
                  <span className="muted small">
                    {" "}
                    {s.appearances}/{s.total}
                  </span>
                </dd>
              </div>
              <div>
                <dt>歌唱</dt>
                <dd>
                  {s.performances}
                  <span className="muted small"> 曲</span>
                </dd>
              </div>
              <div>
                <dt>欠席</dt>
                <dd>
                  {s.absences.length}
                  <span className="muted small"> 公演</span>
                </dd>
              </div>
            </dl>
            <div className="member-bar" aria-hidden>
              <span style={{ width: formatPercent(s.rate) }} />
            </div>

            {s.absences.length > 0 && (
              <ul className="absence-list">
                {[...s.absences].reverse().map((e) => (
                  <li key={e.id}>
                    <Link to={`/${artist.id}/events/${e.id}`}>
                      <span className="absence-date">{formatDate(e.date)}</span>
                      <span className="absence-title">{displayTitle(e.title, artist.name)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small note">
        開催済みのライブ（特典会のみのイベントを除く）が対象。出演メンバーは eventernote の出演者情報と手動修正に基づく。
        {assumed > 0 && `出演者情報の無い ${assumed} 公演は全員出演として数えている。`}
        「歌唱」はセトリ登録済みの公演で参加した曲数。
      </p>
    </section>
  );
}
