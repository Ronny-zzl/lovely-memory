import { useMemo } from "react";
import { Link } from "react-router";
import { computeMemberStats, isLiveEvent } from "@lovely-memory/core/runtime";
import { displayTitle, formatDate, formatPercent, todayJst } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";

export function MembersPage() {
  const { artist, events, allStats } = useArtistData();
  const today = todayJst();
  const members = useMemo(
    () => computeMemberStats({ artist, events, stats: allStats, until: today }),
    [artist, events, allStats, today],
  );
  const assumed = events.filter((e) => isLiveEvent(e) && e.date <= today && e.membersSource === "assumed").length;

  return (
    <section className="members">
      <ul className="member-cards">
        {members.map((s) => (
          <li key={s.member.id} className="member-card" style={{ "--member": s.member.color } as React.CSSProperties}>
            <h2 className="member-name">
              <span className="dot" style={{ background: s.member.color }} />
              {s.member.name}
              {s.member.colorName && <span className="muted small">{s.member.colorName}</span>}
            </h2>

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
