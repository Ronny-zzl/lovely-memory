import { useMemo, useState } from "react";
import { Link } from "react-router";
import { eventCostume, eventHasType, isLiveEvent, type EventType, type ResolvedEvent } from "@lovely-memory/core/runtime";
import { useAttendance } from "../attendance.ts";
import { AttendanceHint } from "../components/AttendanceHint.tsx";
import { AttendanceToggle } from "../components/AttendanceToggle.tsx";
import { MemberDots } from "../components/MemberDots.tsx";
import { TypeBadges } from "../components/TypeBadges.tsx";
import { displayTitle, EVENT_TYPE_LABEL, formatDayWithWeekday } from "../format.ts";
import { useSearchParamsAfterHydration } from "../hydration.ts";
import { useArtistData } from "./ArtistLayout.tsx";
import "./EventsPage.css";

const ALL_TYPES: EventType[] = ["oneman", "taiban", "external", "release", "free", "tokuten"];
const DEFAULT_HIDDEN: EventType[] = ["tokuten"];

export function EventsPage() {
  const { artist, events, allStats, isHeld } = useArtistData();
  const [params, setParams] = useSearchParamsAfterHydration();

  const setlistByEvent = useMemo(() => new Map(allStats.events.map((e) => [e.event.id, e])), [allStats]);
  const presentTypes = ALL_TYPES.filter((t) => events.some((e) => eventHasType(e, t)));
  const selected = new Set<EventType>(
    params.get("types") ? (params.get("types")!.split(",") as EventType[]) : presentTypes.filter((t) => !DEFAULT_HIDDEN.includes(t)),
  );

  const toggle = (t: EventType) => {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    const isDefault = presentTypes.every((x) => next.has(x) === !DEFAULT_HIDDEN.includes(x));
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (isDefault) p.delete("types");
        else p.set("types", [...next].join(",") || "none");
        return p;
      },
      { replace: true },
    );
  };

  // 選ばれた種別のどれかに該当すれば表示（主催対バンは「対バン・フェス」にも該当）
  const visible = events.filter((e) => [...selected].some((t) => eventHasType(e, t)));
  // 「参戦」ボタンは押す機会が少ないので、狭い画面では普段は印だけ出し、記録するときだけボタンを出す
  // （ボタンと印は両方出して CSS で見せ分ける。EventsPage.css）
  const attendance = useAttendance();
  const [editing, setEditing] = useState(false);
  const upcoming = visible.filter((e) => !isHeld(e));
  const past = visible.filter((e) => !upcoming.includes(e)).reverse();

  // 月ごとにまとめる（新しい順）
  const months = new Map<string, ResolvedEvent[]>();
  for (const e of past) {
    const key = e.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), e]);
  }

  const row = (e: ResolvedEvent) => {
    const sl = setlistByEvent.get(e.id);
    const entries = sl?.stages.flatMap((s) => s.entries) ?? [];
    const debuts = entries.filter((x) => x.debut).length;
    const costume = eventCostume(artist, e, isHeld(e));
    return (
      <li key={e.id} className="with-toggle">
        <Link to={String(e.id)} className="event-row event-row-stacked">
          <span className="event-date">{formatDayWithWeekday(e.date)}</span>
          <span className="event-main">
            <span className="event-title">
              <span className="event-badges">
                <TypeBadges types={e.types} />
              </span>
              <span className="event-name">{displayTitle(e.title, artist.name)}</span>
            </span>
            <span className="event-meta">
              {e.venue && <span>{e.venue.name}</span>}
              {sl ? (
                <span>
                  {entries.length} 曲{sl.stages.length > 1 && `（${sl.stages.length} ステージ）`}
                </span>
              ) : (
                isLiveEvent(e) && <span className="muted">{isHeld(e) ? "セトリ未登録" : "開催予定"}</span>
              )}
              {debuts > 0 && <span className="debut-count">初披露 {debuts}</span>}
              {costume?.special && <span className="costume-badge">{costume.name}</span>}
            </span>
          </span>
          <MemberDots artist={artist} present={e.members} date={e.date} />
          {attendance.isAttended(e.id) && <span className="attend-mark">✓ {isHeld(e) ? "参戦" : "予定"}</span>}
        </Link>
        {isLiveEvent(e) && <AttendanceToggle eventId={e.id} upcoming={!isHeld(e)} />}
      </li>
    );
  };

  return (
    <section className={editing ? "events editing" : "events"}>
      <fieldset className="chips" aria-label="イベントの種別">
        {presentTypes.map((t) => (
          <label key={t} className="chip">
            <input type="checkbox" checked={selected.has(t)} onChange={() => toggle(t)} />
            {EVENT_TYPE_LABEL[t]}
          </label>
        ))}
      </fieldset>

      <AttendanceHint
        artistId={artist.id}
        eventIds={events.filter(isLiveEvent).map((e) => e.id)}
        buttonsHidden={!editing}
        action={
          <button
            type="button"
            className={`attend-edit only-narrow${editing ? " on" : ""}`}
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "完了" : "参戦を記録"}
          </button>
        }
      />

      {upcoming.length > 0 && (
        <details className="upcoming">
          <summary className="month-heading">
            今後のイベント<span className="muted small"> {upcoming.length} 件</span>
          </summary>
          <ul className="event-list">{upcoming.map(row)}</ul>
        </details>
      )}

      {[...months].map(([month, list]) => (
        <div key={month}>
          <h2 className="month-heading">
            {month.slice(0, 4)}年{Number(month.slice(5))}月<span className="muted small"> {list.length} 件</span>
          </h2>
          <ul className="event-list">{list.map(row)}</ul>
        </div>
      ))}
      {visible.length === 0 && <p className="muted">該当するイベントがありません</p>}
    </section>
  );
}
