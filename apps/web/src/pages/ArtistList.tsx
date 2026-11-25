import { Suspense, use } from "react";
import { Link } from "react-router";
import { isLiveEvent, type ArtistConfig } from "@lovely-memory/core/runtime";
import { MoonIcon, SunIcon } from "../components/Icons.tsx";
import { InstallButton } from "../components/InstallButton.tsx";
import { ThemeSwitch } from "../components/ThemeSwitch.tsx";
import { artistDataOn, artists, loadArtistData, type ArtistData } from "../data.ts";
import { useToday } from "../hydration.ts";
import { displayTitle, formatDate, formatDayWithWeekday } from "../format.ts";
import "./ArtistList.css";
import { dotStyle } from "../member-color.ts";

const SECTIONS = [
  { path: "songs", label: "楽曲", note: "歌唱率・回数" },
  { path: "events", label: "イベント", note: "セトリ一覧" },
  { path: "trends", label: "傾向", note: "定番の流れ" },
  { path: "members", label: "メンバー", note: "出演・誕生日" },
  { path: "attendance", label: "参戦記録", note: "生で聴いた曲" },
];

export function ArtistList() {
  return (
    <div className="page">
      <header className="site-header hero">
        <div className="hero-card home-hero">
          <div className="hero-actions">
            <InstallButton />
            <ThemeSwitch />
          </div>
          <h1 className="site-title home-title">
            <span className="sun">
              <SunIcon />
            </span>
            ラブリィメモリー
            <span className="moon">
              <MoonIcon />
            </span>
          </h1>
          <p className="home-lead">ライブのセットリストを記録・集計するファンサイト</p>
          <p className="muted small">
            公式の告知から歌われた曲を記録して、歌唱率・初披露・定番の流れなどをまとめています。参戦したイベントに印を付けると、生で聴いた曲も分かります。
          </p>
        </div>
      </header>
      <main>
        <ul className="artist-list">
          {artists.map((a) => (
            <li key={a.id}>
              <Suspense fallback={<ArtistCard artist={a} />}>
                <ArtistCardWithData artist={a} />
              </Suspense>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

/** データを読み込んでから、数字・最新のセトリ・次のイベントを添える */
function ArtistCardWithData({ artist }: { artist: ArtistConfig }) {
  return <ArtistCard artist={artist} data={artistDataOn(use(loadArtistData(artist)), useToday())} />;
}

function ArtistCard({ artist, data }: { artist: ArtistConfig; data?: ArtistData }) {
  const base = `/${artist.id}`;
  const latest = data?.allStats.events.reduce<(typeof data.allStats.events)[number] | undefined>(
    (a, e) => (!a || `${e.event.date}${e.event.start ?? ""}` >= `${a.event.date}${a.event.start ?? ""}` ? e : a),
    undefined,
  );
  const next = data?.events.filter((e) => isLiveEvent(e) && !data.isHeld(e)).sort((a, b) => a.date.localeCompare(b.date))[0];
  // 楽曲ページの既定（コラボステージを含めない）と同じ数え方
  const performances = data?.allStats.events.reduce(
    (n, e) => n + e.stages.filter((st) => !st.collab).reduce((m, st) => m + st.entries.length, 0),
    0,
  );
  const played = data?.allStats.songs.filter((s) => !s.song.cover && s.count > 0).length;
  const songTotal = data?.songs.filter((s) => !s.cover).length;
  const latestSongs = latest?.stages.reduce((n, st) => n + st.entries.length, 0);

  return (
    <article className="artist-card">
      {/* グループのページ（/:artistId → 楽曲へ）。smoke テストはこのリンクからグループを見つける */}
      <Link to={base} className="artist-card-head">
        <span className="artist-card-name">{artist.name}</span>
        {artist.subtitle && <span className="artist-card-sub">{artist.subtitle}</span>}
        {artist.draft && <span className="badge artist-card-draft">下書き（非公開）</span>}
      </Link>
      <ul className="artist-card-members">
        {artist.members.map((m) => (
          <li key={m.id}>
            <span className="dot" style={dotStyle(m.color)} />
            {m.name}
          </li>
        ))}
      </ul>
      {artist.since && <p className="muted small artist-card-since">{formatDate(artist.since)} デビュー</p>}

      {data && (
        <dl className="artist-card-stats">
          <div>
            <dt>イベント</dt>
            <dd>{data.allStats.events.length}</dd>
          </div>
          <div>
            <dt>総歌唱</dt>
            <dd>{performances}</dd>
          </div>
          <div>
            <dt>披露曲</dt>
            <dd>
              {played}
              <span className="stat-total"> / {songTotal}</span>
            </dd>
          </div>
        </dl>
      )}

      {(latest || next) && (
        <div className="artist-card-events">
          {latest && (
            <Link to={`${base}/events/${latest.event.id}`} className="artist-card-event">
              <span className="artist-card-event-label">最新のセトリ</span>
              <span className="event-date">{formatDayWithWeekday(latest.event.date)}</span>
              <span className="artist-card-event-title">{displayTitle(latest.event.title, artist.name)}</span>
              <span className="muted small">{latestSongs} 曲</span>
            </Link>
          )}
          {next && (
            <Link to={`${base}/events/${next.id}`} className="artist-card-event">
              <span className="artist-card-event-label">次のイベント</span>
              <span className="event-date">{formatDayWithWeekday(next.date)}</span>
              <span className="artist-card-event-title">{displayTitle(next.title, artist.name)}</span>
              {next.start && <span className="muted small">{next.start} 開演</span>}
            </Link>
          )}
        </div>
      )}

      <nav className="artist-card-links">
        {SECTIONS.map((s) => (
          <Link key={s.path} to={`${base}/${s.path}`}>
            <span className="artist-card-link-label">{s.label}</span>
            <span className="muted small">{s.note}</span>
          </Link>
        ))}
      </nav>
    </article>
  );
}
