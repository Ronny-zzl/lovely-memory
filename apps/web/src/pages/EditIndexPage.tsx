import { useState } from "react";
import { Link } from "react-router";
import { isLiveEvent, type ResolvedEvent } from "@lovely-memory/core/runtime";
import { TypeBadges } from "../components/TypeBadges.tsx";
import { displayTitle, formatDayWithWeekday } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";
import "./EditPages.css";

type Filter = "all" | "unfinished" | "missing";
const FILTERS: Array<[Filter, string]> = [
  ["all", "すべて"],
  ["unfinished", "未完成"],
  ["missing", "未入力だけ"],
];

/**
 * 入力画面の一覧（プレビュー版だけ）。開催済みのライブを新しい順に、セトリの入力状況と一緒に並べる。
 * 公式のセトリ告知が無いグループで、ファンが記録を入れていくためのもの。
 */
export function EditIndexPage() {
  const { artist, events, allStats, isHeld } = useArtistData();
  const [filter, setFilter] = useState<Filter>("all");
  const setlists = new Map(allStats.events.map((e) => [e.event.id, e]));

  const status = (e: ResolvedEvent) => {
    const sl = setlists.get(e.id);
    if (!sl) return { label: "未入力", cls: "missing" };
    if (sl.completeness === "partial" || sl.unknownSongs > 0) return { label: "一部だけ", cls: "partial" };
    if (sl.completeness === "unordered") return { label: "曲順不明", cls: "partial" };
    return { label: "入力済み", cls: "done" };
  };

  const held = events.filter((e) => isLiveEvent(e) && isHeld(e)).reverse();
  const missing = held.filter((e) => status(e).cls === "missing");
  // 未完成：未入力・一部だけ・曲順不明（入力済み以外）
  const unfinished = held.filter((e) => status(e).cls !== "done");
  const shown = filter === "missing" ? missing : filter === "unfinished" ? unfinished : held;

  return (
    <section className="edit-index">
      <h2 className="visually-hidden">セトリの入力</h2>
      <p className="muted small">
        開催済みのライブ {held.length} 件のうち、未完成（未入力・一部だけ・曲順不明） {unfinished.length} 件（うち未入力 {missing.length}{" "}
        件）。イベントを選ぶとセトリを入力・修正できます（保存すると数分でサイトに反映されます）。
      </p>
      <fieldset className="chips" aria-label="表示するイベント">
        {FILTERS.map(([v, label]) => (
          <label key={v} className="chip">
            <input type="radio" name="edit-filter" checked={filter === v} onChange={() => setFilter(v)} />
            {label}
          </label>
        ))}
      </fieldset>
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
