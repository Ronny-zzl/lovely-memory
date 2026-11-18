import { Link } from "react-router";
import { InstallButton } from "../components/InstallButton.tsx";
import { artists } from "../data.ts";
import { formatDate } from "../format.ts";

export function ArtistList() {
  return (
    <div className="page">
      <header className="site-header">
        <InstallButton />
        <h1 className="site-title">ラブリィメモリー</h1>
        <p className="muted">ライブのセットリストを記録・集計する</p>
      </header>
      <main>
        <ul className="artist-list">
          {artists.map((a) => (
            <li key={a.id}>
              <Link to={`/${a.id}`} className="artist-card">
                <span className="artist-card-name">{a.name}</span>
                {a.subtitle && <span className="artist-card-sub">{a.subtitle}</span>}
                {a.since && <span className="muted small">{formatDate(a.since)} 〜</span>}
                <span className="member-dots" aria-hidden>
                  {a.members.map((m) => (
                    <span key={m.id} className="dot" style={{ background: m.color }} />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
