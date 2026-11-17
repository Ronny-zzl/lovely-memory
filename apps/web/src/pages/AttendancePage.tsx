import { useMemo, useState } from "react";
import { Link } from "react-router";
import { isLiveEvent, type ResolvedEvent, type Song } from "@lovely-memory/core/runtime";
import { fetchEventernote, useAttendance } from "../attendance.ts";
import { AttendanceBackup } from "../components/AttendanceBackup.tsx";
import { AttendanceShare } from "../components/AttendanceShare.tsx";
import { AttendanceToggle } from "../components/AttendanceToggle.tsx";
import { artists } from "../data.ts";
import { displayTitle, formatDate, formatDayWithWeekday, formatPercent, todayJst } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";

// 全アーティストのうち一番古い活動開始日から読み込む（eventernote の連携はサイト全体で 1 つ）
const SINCE = artists.map((a) => a.since).sort()[0] ?? "2000-01-01";

function EventernoteSection() {
  const attendance = useAttendance();
  const link = attendance.eventernote;
  const [user, setUser] = useState(link?.user ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = async (name: string) => {
    setBusy(true);
    setError(undefined);
    try {
      attendance.setEventernote(await fetchEventernote(name.trim(), SINCE));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="attend-source">
      <h3 className="section-heading">eventernote 連携</h3>
      {link ? (
        <p className="small">
          <a href={`https://www.eventernote.com/users/${encodeURIComponent(link.user)}`} target="_blank" rel="noopener noreferrer">
            {link.user}
          </a>{" "}
          の参加イベントを読み込み済み
          <span className="muted">（{new Date(link.syncedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}）</span>
          <span className="attend-actions">
            <button type="button" className="share-button" disabled={busy} onClick={() => load(link.user)}>
              {busy ? "読み込み中…" : "再読み込み"}
            </button>
            <button type="button" className="share-button" disabled={busy} onClick={() => attendance.setEventernote(undefined)}>
              連携を解除
            </button>
          </span>
        </p>
      ) : (
        <form
          className="attend-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (user.trim()) void load(user);
          }}
        >
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="eventernote のユーザー名"
            aria-label="eventernote のユーザー名"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="share-button" disabled={busy || !user.trim()}>
            {busy ? "読み込み中…" : "読み込む"}
          </button>
        </form>
      )}
      {error && <p className="small error">{error}</p>}
      <p className="muted small">
        eventernote で「参加」にしたイベントに印が付きます（ユーザー名は https://www.eventernote.com/users/<strong>ここ</strong>
        の部分）。各公演の「参戦」ボタンで手で付け外しもでき、そちらが優先されます。記録はこのブラウザだけに保存され、サーバーには残りません。
      </p>
    </section>
  );
}

type Heard = { song: Song; count: number; first: { eventId: number; date: string } };

export function AttendancePage() {
  const { artist, events, allStats } = useArtistData();
  const attendance = useAttendance();
  const today = todayJst();

  const live = events.filter(isLiveEvent);
  const attended = live.filter((e) => attendance.isAttended(e.id));
  const past = attended.filter((e) => e.date <= today);
  const planned = attended.filter((e) => e.date > today);
  const held = live.filter((e) => e.date <= today).length;

  const { heard, notHeard, total } = useMemo(() => {
    const ids = new Set(past.map((e) => e.id));
    const bySong = new Map<string, Heard>();
    let total = 0;
    for (const es of allStats.events) {
      if (!ids.has(es.event.id)) continue;
      for (const st of es.stages) {
        for (const x of st.entries) {
          total++;
          const h = bySong.get(x.song.id);
          if (h) h.count++;
          else bySong.set(x.song.id, { song: x.song, count: 1, first: { eventId: es.event.id, date: es.event.date } });
        }
      }
    }
    const heard = [...bySong.values()].sort((a, b) => b.count - a.count || a.first.date.localeCompare(b.first.date));
    // 披露されたことのある曲のうち、まだ聴いていないもの（歌唱率の高い順＝次に聴けそうな順）
    const notHeard = allStats.songs.filter((s) => s.count > 0 && !bySong.has(s.song.id)).sort((a, b) => b.rate - a.rate);
    return { heard, notHeard, total };
  }, [past.map((e) => e.id).join(","), allStats]);

  const sung = allStats.songs.filter((s) => s.count > 0).length;
  const row = (e: ResolvedEvent) => (
    <li key={e.id} className="with-toggle">
      <Link to={`/${artist.id}/events/${e.id}`} className="event-row">
        <span className="event-date">
          <span className="event-year">{e.date.slice(0, 4)}</span>
          {formatDayWithWeekday(e.date)}
        </span>
        <span className="event-main">
          <span className="event-title">{displayTitle(e.title, artist.name)}</span>
          {e.venue && <span className="event-meta">{e.venue.name}</span>}
        </span>
      </Link>
      <AttendanceToggle eventId={e.id} date={e.date} />
    </li>
  );

  return (
    <div className="attendance">
      <EventernoteSection />

      <div className="summary summary-4">
        <div className="stat">
          <span className="stat-value">
            {past.length}
            <span className="stat-total"> / {held}</span>
          </span>
          <span className="stat-label">参戦した公演</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {heard.length}
            <span className="stat-total"> / {sung}</span>
          </span>
          <span className="stat-label">生で聴いた曲</span>
        </div>
        <div className="stat">
          <span className="stat-value">{total}</span>
          <span className="stat-label">聴いた歌唱（のべ）</span>
        </div>
        <div className="stat">
          <span className="stat-value">{planned.length}</span>
          <span className="stat-label">参戦予定</span>
        </div>
      </div>

      {past.length > 0 && (
        <div className="attend-share">
          <AttendanceShare
            card={{
              artistName: artist.name,
              subtitle: artist.subtitle,
              date: today,
              attended: past.length,
              held,
              heardSongs: heard.length,
              sungSongs: sung,
              performances: total,
              topSongs: heard.slice(0, 3).map((h) => ({ title: h.song.title, count: h.count })),
              notHeard: notHeard.length,
              firstDate: past[0]?.date,
              host: location.host,
            }}
            postText={`${artist.name} 参戦記録\n参戦 ${past.length} 公演・生で聴いた曲 ${heard.length}/${sung}・のべ ${total} 曲`}
            hashtags={artist.shareHashtags}
            fileName={`lovely-memory-参戦記録-${today.replaceAll("-", "")}.png`}
          />
        </div>
      )}

      {past.length === 0 && planned.length === 0 ? (
        <p className="muted empty-setlist">
          まだ参戦記録がありません。eventernote から読み込むか、<Link to={`/${artist.id}/events`}>公演一覧</Link>の「＋ 参戦」で印を付けてください。
        </p>
      ) : (
        <>
          {heard.length > 0 && (
            <section className="song-section">
              <h3 className="section-heading">生で聴いた曲</h3>
              <ul className="chain-list">
                {heard.map((h) => (
                  <li key={h.song.id}>
                    <Link to={`/${artist.id}/songs/${h.song.id}`} className="trend-song">
                      {h.song.title}
                    </Link>
                    <span className="rank-count">
                      {h.count}回<span className="muted small"> 初 {formatDate(h.first.date)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {notHeard.length > 0 && (
            <section className="song-section">
              <h3 className="section-heading">
                まだ生で聴いていない曲<span className="muted small"> 歌唱率の高い順</span>
              </h3>
              <ul className="chain-list">
                {notHeard.map((s) => (
                  <li key={s.song.id}>
                    <Link to={`/${artist.id}/songs/${s.song.id}`} className="trend-song">
                      {s.song.title}
                    </Link>
                    <span className="rank-count muted small">歌唱率 {formatPercent(s.rate)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {planned.length > 0 && (
            <section className="song-section">
              <h3 className="section-heading">参戦予定</h3>
              <ul className="event-list">{planned.map(row)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section className="song-section">
              <h3 className="section-heading">参戦した公演</h3>
              <ul className="event-list">{[...past].reverse().map(row)}</ul>
            </section>
          )}
        </>
      )}
      <AttendanceBackup />
    </div>
  );
}
