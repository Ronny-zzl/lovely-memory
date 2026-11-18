import { Link } from "react-router";
import { costumeStats } from "@lovely-memory/core/runtime";
import { formatDate, todayJst } from "../format.ts";
import { useArtistData } from "../pages/ArtistLayout.tsx";

/** 傾向タブの「衣装」：衣装ごとの公演数と、最初・最後に着た公演 */
export function CostumesSection() {
  const { artist, events } = useArtistData();
  const stats = costumeStats(artist, events, todayJst());
  if (stats.length === 0) return null;
  const link = (e: { id: number; date: string }) => (
    <Link to={`/${artist.id}/events/${e.id}`} className="muted small">
      {formatDate(e.date)}
    </Link>
  );
  return (
    <section className="song-section">
      <h3 className="section-heading">
        衣装<span className="muted small"> 開催済みのライブ</span>
      </h3>
      <ul className="chain-list">
        {stats.map((s) => (
          <li key={s.costume.id}>
            <span className="costume-name">
              {s.costume.name}
              {s.costume.special && <span className="costume-badge">特別</span>}
            </span>
            <span className="rank-count">
              {s.count} 公演
              <span className="costume-range">
                {link(s.first)}
                {s.last.date !== s.first.date && (
                  <>
                    <span className="muted small"> 〜 </span>
                    {link(s.last)}
                  </>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
