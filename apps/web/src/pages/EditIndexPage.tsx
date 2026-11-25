import { useState } from "react";
import { Link } from "react-router";
import { isLiveEvent, type ResolvedEvent } from "@lovely-memory/core/runtime";
import { TypeBadges } from "../components/TypeBadges.tsx";
import { displayTitle, formatDayWithWeekday } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";
import "./EditPages.css";

/**
 * 入力画面の一覧（プレビュー版だけ）。開催済みのライブを新しい順に、セトリの入力状況と一緒に並べる。
 * 公式のセトリ告知が無いグループで、ファンが記録を入れていくためのもの。
 */
export function EditIndexPage() {
  const { artist, events, allStats, isHeld } = useArtistData();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const setlists = new Map(allStats.events.map((e) => [e.event.id, e]));

  const status = (e: ResolvedEvent) => {
    const sl = setlists.get(e.id);
    if (!sl) return { label: "未入力", cls: "missing" };
    if (sl.completeness === "partial" || sl.unknownSongs > 0) return { label: "一部だけ", cls: "partial" };
    if (sl.completeness === "unordered") return { label: "曲順不明", cls: "partial" };
    return { label: "入力済み", cls: "done" };
  };

  const held = events.filter((e) => isLiveEvent(e) && isHeld(e)).reverse();
  const missing = held.filter((e) => !setlists.has(e.id)).length;
  const shown = onlyMissing ? held.filter((e) => !setlists.has(e.id)) : held;

  return (
    <section className="edit-index">
      <h2 className="visually-hidden">セトリの入力</h2>
      <p className="muted small">
        開催済みのライブ {held.length} 件のうち、未入力 {missing}{" "}
        件。イベントを選ぶとセトリを入力・修正できます（保存すると数分でサイトに反映されます）。
      </p>
      <label className="chip">
        <input type="checkbox" checked={onlyMissing} onChange={() => setOnlyMissing(!onlyMissing)} />
        未入力だけ
      </label>
      <ul className="event-list edit-list">
        {shown.map((e) => {
          const st = status(e);
          return (
            <li key={e.id}>
              <Link to={String(e.id)} className="event-row event-row-stacked">
                <span className="event-date">{formatDayWithWeekday(e.date)}</span>
                <span className="event-main">
                  <span className="event-title">
                    <span className="event-badges">
                      <TypeBadges types={e.types} />
                    </span>
                    <span className="event-name">{displayTitle(e.title, artist.name)}</span>
                  </span>
                  {e.venue && <span className="event-meta">{e.venue.name}</span>}
                </span>
                <span className={`edit-status ${st.cls}`}>{st.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
