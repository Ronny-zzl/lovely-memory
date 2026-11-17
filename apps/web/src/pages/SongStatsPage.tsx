import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { computeStats, eventHasType, isLiveEvent, normalizeTitle, type EventType, type SongStats } from "@lovely-memory/core";
import { daysBetween, EVENT_TYPE_LABEL, formatDate, formatPercent, LIVE_EVENT_TYPES, todayJst } from "../format.ts";
import { useArtistData } from "./ArtistLayout.tsx";

type SortKey = "title" | "count" | "events" | "rate" | "first" | "last" | "daysSince";

type Column = {
  key: SortKey;
  label: string;
  numeric?: boolean;
  className?: string;
  title?: string;
  cell: (s: SongStats, today: string) => React.ReactNode;
};

/** 最後に歌われてからの日数（未披露は null） */
const daysSince = (s: SongStats, today: string) => (s.last ? daysBetween(s.last.date, today) : null);

const COUNT: Column = {
  key: "count",
  label: "回数",
  numeric: true,
  title: "歌唱回数（同一公演で 2 回歌えば 2 回）",
  cell: (s) => s.count,
};
const EVENTS: Column = {
  key: "events",
  label: "公演",
  numeric: true,
  title: "歌唱した公演数",
  cell: (s) => s.events,
};

const COLUMNS_BEFORE: Column[] = [
  {
    key: "rate",
    label: "歌唱率",
    numeric: true,
    className: "rate",
    title: "初披露以降の公演のうち歌唱した割合",
    cell: (s) => (
      <span title={s.count > 0 ? `${s.events} / ${s.eligibleEvents} 公演` : undefined}>
        <span className="bar" style={{ "--rate": s.rate } as React.CSSProperties} />
        <span className="rate-text">
          {s.count > 0 ? formatPercent(s.rate) : "–"}
          {s.count > 0 && (
            <span className="rate-frac">
              {s.events}/{s.eligibleEvents}
            </span>
          )}
        </span>
      </span>
    ),
  },
  {
    key: "first",
    label: "初披露",
    className: "date hide-sm",
    title: "記録上で最初に歌われた日",
    cell: (s) => (s.first ? formatDate(s.first.date) : "未披露"),
  },
  {
    key: "last",
    label: "最終",
    // スマホでは「前回から」と内容が重なるので省く
    className: "date hide-sm",
    title: "最後に歌われた日",
    cell: (s) => (s.last ? formatDate(s.last.date) : "–"),
  },
  {
    key: "daysSince",
    label: "前回から",
    numeric: true,
    title: "最後に歌われてから今日までの日数",
    cell: (s, today) => {
      const d = daysSince(s, today);
      return d === null ? "–" : `${d}日`;
    },
  },
];

/** 並び替えに使う値。未披露曲は null（並び順に関わらず末尾に置く） */
function sortValue(s: SongStats, key: SortKey, today: string): string | number | null {
  switch (key) {
    case "title":
      return s.song.title;
    case "first":
      return s.first?.date ?? null;
    case "last":
      return s.last?.date ?? null;
    case "daysSince":
      return daysSince(s, today);
    default:
      return s.count === 0 ? null : s[key];
  }
}

export function SongStatsPage() {
  const { artist, songs, events, setlists, allStats } = useArtistData();
  const [params, setParams] = useSearchParams();
  const today = todayJst();

  const presentTypes = useMemo(() => {
    const withSetlist = new Set(setlists.map((s) => s.event));
    return LIVE_EVENT_TYPES.filter((t) => events.some((e) => eventHasType(e, t) && withSetlist.has(e.id)));
  }, [events, setlists]);

  const selectedTypes = new Set<EventType>(
    params.get("types") ? (params.get("types")!.split(",") as EventType[]) : presentTypes,
  );
  const era = params.get("era") ?? "";
  const unit = params.get("unit") ?? "";
  const q = params.get("q") ?? "";
  const sortKey = (params.get("sort") as SortKey) ?? "rate";
  // コラボステージ（他グループ主催の企画など）は既定で集計しない
  const includeCollab = params.get("collab") === "1";
  const hasCollab = setlists.some((s) => s.stages?.some((st) => st.collab));
  // コラボステージでしか歌われていない曲（除外時は一覧からも外す）
  const collabOnly = useMemo(
    () =>
      new Set(
        allStats.songs
          .filter((s) => s.count > 0 && s.performances.every((p) => p.collab))
          .map((s) => s.song.id),
      ),
    [allStats],
  );
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
    // 選ばれた種別のどれかに該当すれば集計対象（主催対バンは「対バン・フェス」にも該当）
    () =>
      computeStats({
        songs,
        events,
        setlists,
        includeCollab,
        filter: (e) => [...selectedTypes].some((t) => eventHasType(e, t)),
      }),
    // selectedTypes は毎回作り直されるので、内容を表す typesKey で再計算を判定する
    [songs, events, setlists, typesKey, includeCollab],
  );

  const rows = useMemo(() => {
    const nq = normalizeTitle(q);
    const filtered = stats.songs.filter(
      (s) =>
        (includeCollab || !collabOnly.has(s.song.id)) &&
        (!era || s.song.era === era) &&
        (!unit || s.song.unit === unit) &&
        (!nq || [s.song.title, ...s.song.aliases].some((t) => normalizeTitle(t).includes(nq))),
    );
    return filtered.sort((a, b) => {
      const va = sortValue(a, sortKey, today);
      const vb = sortValue(b, sortKey, today);
      if (va === null || vb === null) {
        if (va !== vb) return va === null ? 1 : -1;
      } else {
        const c = typeof va === "string" ? va.localeCompare(vb as string, "ja") : va - (vb as number);
        if (c) return desc ? -c : c;
      }
      // 同値の場合: 回数の多い順 → 発売日順
      return b.count - a.count || (a.song.release?.date ?? "9").localeCompare(b.song.release?.date ?? "9");
    });
  }, [stats, era, unit, q, sortKey, desc, today, includeCollab, collabOnly]);

  // 同じ公演で 2 回歌われた曲が無いうちは「回数」と「公演」が常に一致するので、公演列は出さない
  const columns: Column[] = [
    COUNT,
    ...(stats.songs.some((s) => s.count !== s.events) ? [EVENTS] : []),
    ...COLUMNS_BEFORE,
  ];

  const played = stats.songs.filter((s) => s.count > 0).length;
  const songTotal = includeCollab ? songs.length : songs.filter((s) => !collabOnly.has(s.id)).length;
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
    else update({ sort: key === "rate" ? null : key, dir: null });
  };

  return (
    <section className="song-stats">
      <div className="summary">
        <div className="stat">
          <span className="stat-value">{stats.events.length}</span>
          <span className="stat-label">公演</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.totalPerformances}</span>
          <span className="stat-label">総歌唱</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {played}
            <span className="stat-total"> / {songTotal}</span>
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
          {hasCollab && (
            <label className="chip chip-option" title="他グループとのコラボステージでの歌唱も集計に含める">
              <input
                type="checkbox"
                checked={includeCollab}
                onChange={() => update({ collab: includeCollab ? null : "1" })}
              />
              コラボステージを含む
            </label>
          )}
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
              <th title="曲名">
                <button type="button" onClick={() => setSort("title")}>
                  曲名
                  <span className="sort-mark">{sortKey === "title" ? (desc ? "▼" : "▲") : ""}</span>
                </button>
              </th>
              {columns.map((c) => (
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="empty-row">
                  該当する曲がありません
                  {!includeCollab && collabOnly.size > 0 && "（コラボステージのみの曲は「コラボステージを含む」で表示）"}
                </td>
              </tr>
            )}
            {rows.map((s, i) => (
              <tr key={s.song.id} className={s.count === 0 ? "unplayed" : undefined}>
                <td className="rank">{s.count > 0 ? i + 1 : "–"}</td>
                <td className="title">
                  <Link to={s.song.id} className="song-title">
                    {s.song.title}
                  </Link>
                  <span className="song-meta">
                    {s.song.era && eraLabel.has(s.song.era) && (
                      <span className={`badge era-${s.song.era}`}>{eraLabel.get(s.song.era)}</span>
                    )}
                    {s.song.unit && unitLabel.has(s.song.unit) && <span className="unit">{unitLabel.get(s.song.unit)}</span>}
                  </span>
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={[c.numeric && "num", c.className].filter(Boolean).join(" ")}>
                    {c.cell(s, today)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small note">
        集計対象はセトリを登録済みの公演のみ（{stats.events.length} / {events.filter(isLiveEvent).length} 公演）。
        「歌唱率」は初披露以降の公演のうち歌唱した割合、「前回から」は最後に歌われてから今日までの日数。
      </p>
    </section>
  );
}
