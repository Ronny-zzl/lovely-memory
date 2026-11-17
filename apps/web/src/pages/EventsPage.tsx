import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import type { EventType, ResolvedEvent } from "@lovely-memory/core";
import { MemberDots } from "../components/MemberDots.tsx";
import { displayTitle, EVENT_TYPE_LABEL, formatDayWithWeekday, todayJst } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";

const ALL_TYPES: EventType[] = ["oneman", "taiban", "external", "release", "free", "tokuten"];
const DEFAULT_HIDDEN: EventType[] = ["tokuten"];


export function EventsPage() {
  const { artist, events, allStats } = useArtistData();
  const [params, setParams] = useSearchParams();

  const setlistByEvent = useMemo(() => new Map(allStats.events.map((e) => [e.event.id, e])), [allStats]);
  const presentTypes = ALL_TYPES.filter((t) => events.some((e) => e.type === t));
  const selected = new Set<EventType>(
    params.get("types")
      ? (params.get("types")!.split(",") as EventType[])
      : presentTypes.filter((t) => !DEFAULT_HIDDEN.includes(t)),
  );

  const toggle = (t: EventType) => {
    const next = new Set(selected);
    next.has(t) ? next.delete(t) : next.add(t);
    const isDefault =
      presentTypes.every((x) => next.has(x) === !DEFAULT_HIDDEN.includes(x));
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        isDefault ? p.delete("types") : p.set("types", [...next].join(",") || "none");
        return p;
      },
      { replace: true },
    );
  };

  const today = todayJst();
  const visible = events.filter((e) => selected.has(e.type));
  const upcoming = visible.filter((e) => e.date >= today && !setlistByEvent.has(e.id));
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
    return (
      <li key={e.id}>
        <Link to={String(e.id)} className="event-row">
          <span className="event-date">{formatDayWithWeekday(e.date)}</span>
          <span className="event-main">
            <span className="event-title">
              <span className={`type-badge type-${e.type}`}>{EVENT_TYPE_LABEL[e.type]}</span>
              {displayTitle(e.title, artist.name)}
            </span>
            <span className="event-meta">
              {e.venue && <span>{e.venue.name}</span>}
              {sl ? (
                <span>
                  {entries.length} 曲{sl.stages.length > 1 && `（${sl.stages.length} ステージ）`}
                </span>
              ) : (
                e.type !== "tokuten" && <span className="muted">{e.date >= today ? "開催予定" : "セトリ未登録"}</span>
              )}
              {debuts > 0 && <span className="debut-count">初披露 {debuts}</span>}
            </span>
          </span>
          <MemberDots artist={artist} present={e.members} />
        </Link>
      </li>
    );
  };

  return (
    <section className="events">
      <fieldset className="chips" aria-label="公演の種別">
        {presentTypes.map((t) => (
          <label key={t} className="chip">
            <input type="checkbox" checked={selected.has(t)} onChange={() => toggle(t)} />
            {EVENT_TYPE_LABEL[t]}
          </label>
        ))}
      </fieldset>

      {upcoming.length > 0 && (
        <details className="upcoming">
          <summary className="month-heading">
            今後の公演<span className="muted small"> {upcoming.length} 公演</span>
          </summary>
          <ul className="event-list">{upcoming.map(row)}</ul>
        </details>
      )}

      {[...months].map(([month, list]) => (
        <div key={month}>
          <h2 className="month-heading">
            {month.slice(0, 4)}年{Number(month.slice(5))}月<span className="muted small"> {list.length} 公演</span>
          </h2>
          <ul className="event-list">{list.map(row)}</ul>
        </div>
      ))}
      {visible.length === 0 && <p className="muted">該当する公演がありません</p>}
    </section>
  );
}
