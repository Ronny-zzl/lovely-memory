import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { computeStats, normalizeTitle, type EventType, type SongStats } from "@lovely-memory/core";
import { EVENT_TYPE_LABEL, formatDate, formatPercent, LIVE_EVENT_TYPES } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";

type SortKey = "title" | "count" | "stages" | "events" | "rate" | "first" | "last" | "sinceLast";

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean; className?: string; title?: string }> = [
  { key: "title", label: "曲名" },
  { key: "count", label: "回数", numeric: true, title: "歌唱回数（同一公演の別ステージも数える）" },
  { key: "stages", label: "ステージ", numeric: true, className: "hide-sm", title: "歌唱したステージ数" },
  { key: "events", label: "公演", numeric: true, title: "歌唱した公演数" },
  { key: "rate", label: "歌唱率", numeric: true, title: "歌唱した公演数 ÷ 集計対象の公演数" },
  { key: "first", label: "初披露", className: "hide-sm", title: "記録上で最初に歌われた日" },
  { key: "last", label: "最終", title: "最後に歌われた日" },
  { key: "sinceLast", label: "空白", numeric: true, title: "最後に歌われてから、何公演歌われていないか" },
];

/** 並び替えに使う値。未披露曲は null（並び順に関わらず末尾に置く） */
function sortValue(s: SongStats, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return s.song.title;
    case "first":
      return s.first?.date ?? null;
    case "last":
      return s.last?.date ?? null;
    case "sinceLast":
      return s.sinceLast;
    default:
      return s.count === 0 ? null : s[key];
  }
}

export function SongStatsPage() {
  const { artist, songs, events, setlists } = useArtistData();
  const [params, setParams] = useSearchParams();

  const presentTypes = useMemo(() => {
    const withSetlist = new Set(setlists.map((s) => s.event));
    return LIVE_EVENT_TYPES.filter((t) => events.some((e) => e.type === t && withSetlist.has(e.id)));
  }, [events, setlists]);

  const selectedTypes = new Set<EventType>(
    params.get("types") ? (params.get("types")!.split(",") as EventType[]) : presentTypes,
  );
  const era = params.get("era") ?? "";
  const unit = params.get("unit") ?? "";
  const q = params.get("q") ?? "";
  const sortKey = (params.get("sort") as SortKey) ?? "count";
  const desc = (params.get("dir") ?? (sortKey === "title" ? "asc" : "desc")) === "desc";

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) v === null || v === "" ? next.delete(k) : next.set(k, v);
        return next;
      },
      { replace: true },
    );

  const typesKey = [...selectedTypes].sort().join(",");
  const stats = useMemo(
    () => computeStats({ songs, events, setlists, filter: (e) => selectedTypes.has(e.type) }),
    // selectedTypes は毎回作り直されるので、内容を表す typesKey で再計算を判定する
    [songs, events, setlists, typesKey],
  );

  const rows = useMemo(() => {
    const nq = normalizeTitle(q);
    const filtered = stats.songs.filter(
      (s) =>
        (!era || s.song.era === era) &&
        (!unit || s.song.unit === unit) &&
        (!nq || [s.song.title, ...s.song.aliases].some((t) => normalizeTitle(t).includes(nq))),
    );
    return filtered.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === null || vb === null) {
        if (va !== vb) return va === null ? 1 : -1;
      } else {
        const c = typeof va === "string" ? va.localeCompare(vb as string, "ja") : va - (vb as number);
        if (c) return desc ? -c : c;
      }
      // 同値の場合: 回数の多い順 → 発売日順
      return b.count - a.count || (a.song.release?.date ?? "9").localeCompare(b.song.release?.date ?? "9");
    });
  }, [stats, era, unit, q, sortKey, desc]);

  const played = stats.songs.filter((s) => s.count > 0).length;
  // 既定の区分・ユニット（artist.json の defaultEra / defaultUnit）はバッジを省略する
  const eraLabel = new Map(artist.eras.filter((e) => e.id !== artist.defaultEra).map((e) => [e.id, e.label]));
  const unitLabel = new Map(artist.units.filter((u) => u.id !== artist.defaultUnit).map((u) => [u.id, u.label]));

  const toggleType = (t: EventType) => {
    const next = new Set(selectedTypes);
    next.has(t) ? next.delete(t) : next.add(t);
    update({ types: next.size === presentTypes.length ? null : [...next].join(",") || "none" });
  };

  const setSort = (key: SortKey) => {
    if (key === sortKey) update({ dir: desc ? "asc" : "desc" });
    else update({ sort: key === "count" ? null : key, dir: null });
  };

  return (
    <section className="song-stats">
      <div className="summary">
        <div className="stat">
          <span className="stat-value">{stats.events.length}</span>
          <span className="stat-label">公演</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.totalStages}</span>
          <span className="stat-label">ステージ</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.totalPerformances}</span>
          <span className="stat-label">総歌唱</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {played}
            <span className="stat-total"> / {songs.length}</span>
          </span>
          <span className="stat-label">披露曲</span>
        </div>
      </div>

      <div className="filters">
        <fieldset className="chips" aria-label="公演の種別">
          {presentTypes.map((t) => (
            <label key={t} className="chip">
              <input type="checkbox" checked={selectedTypes.has(t)} onChange={() => toggleType(t)} />
              {EVENT_TYPE_LABEL[t]}
            </label>
          ))}
        </fieldset>
        <div className="filter-row">
          <select value={era} onChange={(e) => update({ era: e.target.value })} aria-label="区分">
            <option value="">すべての区分</option>
            {artist.eras.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <select value={unit} onChange={(e) => update({ unit: e.target.value })} aria-label="オリジナル">
            <option value="">すべてのオリジナル</option>
            {artist.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="曲名で絞り込み"
            value={q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th className="rank">#</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={[c.numeric && "num", c.className].filter(Boolean).join(" ")}
                  title={c.title}
                  aria-sort={sortKey === c.key ? (desc ? "descending" : "ascending") : undefined}
                >
                  <button type="button" onClick={() => setSort(c.key)}>
                    {c.label}
                    <span className="sort-mark">{sortKey === c.key ? (desc ? "▼" : "▲") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.song.id} className={s.count === 0 ? "unplayed" : undefined}>
                <td className="rank">{s.count > 0 ? i + 1 : "–"}</td>
                <td className="title">
                  <span className="song-title">{s.song.title}</span>
                  <span className="song-meta">
                    {s.song.era && eraLabel.has(s.song.era) && (
                      <span className={`badge era-${s.song.era}`}>{eraLabel.get(s.song.era)}</span>
                    )}
                    {s.song.unit && unitLabel.has(s.song.unit) && <span className="unit">{unitLabel.get(s.song.unit)}</span>}
                  </span>
                </td>
                <td className="num">{s.count}</td>
                <td className="num hide-sm">{s.stages}</td>
                <td className="num">{s.events}</td>
                <td className="num rate">
                  <span className="bar" style={{ "--rate": s.rate } as React.CSSProperties} />
                  <span className="rate-text">{s.count > 0 ? formatPercent(s.rate) : "–"}</span>
                </td>
                <td className="date hide-sm">{s.first ? formatDate(s.first.date) : "未披露"}</td>
                <td className="date">{s.last ? formatDate(s.last.date) : "–"}</td>
                <td className="num">{s.sinceLast ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small note">
        集計対象はセトリを登録済みの公演のみ（{stats.events.length} / {events.filter((e) => e.type !== "tokuten").length} 公演）。
        「空白」は最後に歌われてから続いた公演数。
      </p>
    </section>
  );
}
