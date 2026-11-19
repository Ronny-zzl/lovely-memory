import { useMemo } from "react";
import { Link } from "react-router";
import {
  computeStats,
  eventHasType,
  positionRole,
  isLiveEvent,
  normalizeTitle,
  type EventType,
  type SongStats,
} from "@lovely-memory/core/runtime";
import { daysBetween, EVENT_TYPE_LABEL, formatDate, formatPercent, LIVE_EVENT_TYPES, POSITION_ROLE_LABEL, tieupLabels } from "../format.ts";
import { UnitTag } from "../components/UnitTag.tsx";
import { useSearchParamsAfterHydration } from "../hydration.ts";
import { useArtistData } from "./ArtistLayout.tsx";
import "./SongStatsPage.css";

type SortKey = "title" | "count" | "events" | "rate" | "first" | "last" | "daysSince";

type Column = {
  key: SortKey;
  label: string;
  numeric?: boolean;
  className?: string;
  title?: string;
  cell: (s: SongStats, today: string) => React.ReactNode;
};

/** 絞り込みの対象：曲名・別表記・作詞・作曲・編曲（共同名義はメンバー名も） */
const searchTexts = (song: SongStats["song"], creditGroups: Record<string, string[]>) => {
  const c = song.credits;
  const credits = [c?.lyrics, c?.music, c?.arrangement].filter((t): t is string => !!t);
  const members = Object.entries(creditGroups).flatMap(([name, people]) => (credits.some((t) => t.includes(name)) ? people : []));
  return [song.title, ...song.aliases, ...credits, ...members];
};

/** 最後に歌われてからの日数（未披露は null） */
const daysSince = (s: SongStats, today: string) => (s.last ? daysBetween(s.last.date, today) : null);

/** イベント数に分母（初披露以降のイベント数）を添える。歌唱率の分子・分母がここで読めるので、歌唱率の列は % だけにする */
const withTotal = (n: number, s: SongStats) =>
  s.count > 0 ? (
    <>
      {n}
      <span className="num-total">/{s.eligibleEvents}</span>
    </>
  ) : (
    n
  );

/**
 * 回数の列。同じイベントで 2 回歌われた曲が無いうちは「回数＝歌唱したイベント数」なので、分母もここに付ける
 * （2 回歌われた曲が出たら「イベント」の列を出し、分母はそちらに移す。回数に付けると 100% を超えて見えるため）
 */
const countColumn = (withEvents: boolean): Column => ({
  key: "count",
  label: "回数",
  numeric: true,
  title: withEvents ? "歌唱回数（同一イベントで 2 回歌えば 2 回）" : "歌唱回数 / 初披露以降のイベント数",
  cell: (s) => (withEvents ? s.count : withTotal(s.count, s)),
});
const EVENTS: Column = {
  key: "events",
  label: "イベント",
  numeric: true,
  title: "歌唱したイベント数 / 初披露以降のイベント数",
  cell: (s) => withTotal(s.events, s),
};

const COLUMNS_BEFORE: Column[] = [
  {
    key: "rate",
    label: "歌唱率",
    numeric: true,
    className: "rate",
    title: "初披露以降のイベントのうち歌唱した割合",
    cell: (s) => (
      <span title={s.count > 0 ? `${s.events} / ${s.eligibleEvents} イベント` : undefined}>
        <span className="bar" style={{ "--rate": s.rate } as React.CSSProperties} />
        <span className="rate-text">{s.count > 0 ? formatPercent(s.rate) : "–"}</span>
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

/** スマホの並べ替えの選択肢（PC は表の見出しを押す） */
const SORT_OPTIONS: Array<[SortKey, string]> = [
  ["rate", "歌唱率"],
  ["count", "回数"],
  ["daysSince", "前回から"],
  ["last", "最終"],
  ["first", "初披露"],
  ["title", "曲名"],
];

const ago = (d: number) => (d === 0 ? "今日" : `${d}日前`);

/**
 * スマホの 1 行の右側：大きく出す数字（並べ替えている項目）と、その下に小さく出す補足。
 * 並べ替えの項目が歌唱率以外のときも、歌唱率は補足に残す
 */
function figures(s: SongStats, sortKey: SortKey, today: string): { main: string; sub: string[] } {
  if (s.count === 0) return { main: "未披露", sub: [] };
  const d = daysSince(s, today)!;
  const rate = `${formatPercent(s.rate)} ${s.events}/${s.eligibleEvents}`;
  switch (sortKey) {
    case "count":
      return { main: `${s.count}回`, sub: [rate, ago(d)] };
    case "events":
      return { main: `${s.events}イベント`, sub: [rate, ago(d)] };
    case "daysSince":
      return { main: ago(d), sub: [rate] };
    case "last":
      return { main: formatDate(s.last!.date), sub: [rate] };
    case "first":
      return { main: formatDate(s.first!.date), sub: [rate] };
    default:
      return { main: formatPercent(s.rate), sub: [`${s.events}/${s.eligibleEvents}`, ago(d)] };
  }
}

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
  const { artist, songs, events, setlists, allStats, patterns } = useArtistData();
  const [params, setParams] = useSearchParamsAfterHydration();
  const { today } = useArtistData();

  const presentTypes = useMemo(() => {
    const withSetlist = new Set(setlists.map((s) => s.event));
    return LIVE_EVENT_TYPES.filter((t) => events.some((e) => eventHasType(e, t) && withSetlist.has(e.id)));
  }, [events, setlists]);

  const typesParam = params.get("types");
  const selectedTypes = useMemo(
    () => new Set<EventType>(typesParam ? (typesParam.split(",") as EventType[]) : presentTypes),
    [typesParam, presentTypes],
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
    () => new Set(allStats.songs.filter((s) => s.count > 0 && s.performances.every((p) => p.collab)).map((s) => s.song.id)),
    [allStats],
  );
  const desc = (params.get("dir") ?? (sortKey === "title" ? "asc" : "desc")) === "desc";

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === "") next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

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
    [songs, events, setlists, selectedTypes, includeCollab],
  );

  const rows = useMemo(() => {
    const nq = normalizeTitle(q);
    const filtered = stats.songs.filter(
      (s) =>
        // カバー曲は歌唱回数が少なく間隔も長いので、統計表ではなく下の「カバー曲」欄に出す
        !s.song.cover &&
        (includeCollab || !collabOnly.has(s.song.id)) &&
        (!era || s.song.era === era) &&
        (!unit || s.song.unit === unit) &&
        (!nq || searchTexts(s.song, artist.creditGroups).some((t) => normalizeTitle(t).includes(nq))),
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
  }, [stats, era, unit, q, sortKey, desc, today, includeCollab, collabOnly, artist.creditGroups]);

  // 同じイベントで 2 回歌われた曲が無いうちは「回数」と「イベント」が常に一致するので、イベント列は出さない
  const withEvents = stats.songs.some((s) => s.count !== s.events);
  const columns: Column[] = [countColumn(withEvents), ...(withEvents ? [EVENTS] : []), ...COLUMNS_BEFORE];

  const played = stats.songs.filter((s) => !s.song.cover && s.count > 0).length;
  // 未披露曲は既定で畳む。曲名で検索しているときは、探している曲が隠れないよう常に表示
  const unplayedCount = rows.filter((s) => s.count === 0).length;
  const showUnplayed = params.get("unplayed") === "1" || q !== "";
  const visibleRows = showUnplayed ? rows : rows.filter((s) => s.count > 0);
  const songTotal = songs.filter((s) => !s.cover && (includeCollab || !collabOnly.has(s.id))).length;
  // カバー曲は全イベントの記録を表示する（上の絞り込みとは独立）。最近歌われた順
  const covers = allStats.songs.filter((s) => s.song.cover).sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? ""));
  // カバー曲だけの区分は選択肢に出さない
  const eraOptions = artist.eras.filter((e) => songs.some((s) => s.era === e.id && !s.cover));
  // 既定の区分・ユニット（artist.json の defaultEra / defaultUnit）はバッジを省略する
  const eraLabel = new Map(artist.eras.filter((e) => e.id !== artist.defaultEra).map((e) => [e.id, e.label]));
  const unitById = new Map(artist.units.filter((u) => u.id !== artist.defaultUnit).map((u) => [u.id, u]));
  // 「ラスト定番」などは全イベントの曲順から判定する（絞り込みに左右されない）
  const roles = new Map(
    patterns.positions.flatMap((p) => {
      const r = positionRole(p);
      return r ? [[p.song.id, r] as const] : [];
    }),
  );

  const hasBadges = (s: SongStats) =>
    !!(s.song.era && eraLabel.has(s.song.era)) ||
    !!(s.song.unit && unitById.has(s.song.unit)) ||
    s.song.tieups.length > 0 ||
    roles.has(s.song.id);
  const meta = (s: SongStats) => (
    <span className="song-meta">
      {s.song.era && eraLabel.has(s.song.era) && <span className={`badge era-${s.song.era}`}>{eraLabel.get(s.song.era)}</span>}
      {s.song.unit && unitById.has(s.song.unit) && <UnitTag unit={unitById.get(s.song.unit)!} />}
      {tieupLabels(s.song.tieups).map((l) => (
        <span key={l} className="badge tieup">
          {l}
        </span>
      ))}
      {roles.has(s.song.id) && <span className="badge role">{POSITION_ROLE_LABEL[roles.get(s.song.id)!]}</span>}
    </span>
  );
  const emptyMessage = (
    <>
      該当する曲がありません
      {!includeCollab && collabOnly.size > 0 && "（コラボステージのみの曲は「コラボステージを含む」で表示）"}
    </>
  );
  const unplayedToggle = unplayedCount > 0 && q === "" && (
    <button type="button" onClick={() => update({ unplayed: showUnplayed ? null : "1" })}>
      {showUnplayed ? "▲ 未披露の曲を隠す" : `▼ 未披露の曲 ${unplayedCount} 曲を表示`}
    </button>
  );

  // スマホで絞り込みを畳んでいるときに、今の条件がわかるように
  const filterSummary = [
    selectedTypes.size === presentTypes.length ? "全種別" : `${selectedTypes.size} 種別`,
    includeCollab && "コラボ含む",
    era && eraOptions.find((e) => e.id === era)?.label,
    unit && artist.units.find((u) => u.id === unit)?.label,
    `${SORT_OPTIONS.find(([k]) => k === sortKey)?.[1] ?? "歌唱率"}順${desc === (sortKey !== "title") ? "" : "（逆）"}`,
  ]
    .filter(Boolean)
    .join("・");

  const toggleType = (t: EventType) => {
    const next = new Set(selectedTypes);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    update({ types: next.size === presentTypes.length ? null : [...next].join(",") || "none" });
  };

  const setSort = (key: SortKey) => {
    if (key === sortKey) update({ dir: desc ? "asc" : "desc" });
    else update({ sort: key === "rate" ? null : key, dir: null });
  };

  return (
    <section className="song-stats">
      <h2 className="visually-hidden">楽曲ごとの歌唱記録</h2>
      <div className="summary">
        <div className="stat">
          <span className="stat-value">{stats.events.length}</span>
          <span className="stat-label">イベント</span>
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

      <div className="filters only-narrow">
        <div className="filter-row">
          <input type="search" placeholder="曲名・作詞・作曲・編曲で絞り込み" value={q} onChange={(e) => update({ q: e.target.value })} />
        </div>
        <details className="filter-panel">
          <summary>
            絞り込み・並べ替え<span className="muted small">{filterSummary}</span>
          </summary>
          <fieldset className="chips" aria-label="イベントの種別">
            {presentTypes.map((t) => (
              <label key={t} className="chip">
                <input type="checkbox" checked={selectedTypes.has(t)} onChange={() => toggleType(t)} />
                {EVENT_TYPE_LABEL[t]}
              </label>
            ))}
            {hasCollab && (
              <label className="chip chip-option" title="他グループとのコラボステージでの歌唱も集計に含める">
                <input type="checkbox" checked={includeCollab} onChange={() => update({ collab: includeCollab ? null : "1" })} />
                コラボステージを含む
              </label>
            )}
          </fieldset>
          <div className="filter-row">
            <select value={era} onChange={(e) => update({ era: e.target.value })} aria-label="区分" className={era ? "is-set" : undefined}>
              <option value="">すべての区分</option>
              {eraOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <select
              value={unit}
              onChange={(e) => update({ unit: e.target.value })}
              aria-label="オリジナル"
              className={unit ? "is-set" : undefined}
            >
              <option value="">すべてのオリジナル</option>
              {artist.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            <span className="sort-control">
              <select
                value={sortKey}
                onChange={(e) => update({ sort: e.target.value === "rate" ? null : e.target.value, dir: null })}
                aria-label="並べ替え"
              >
                {SORT_OPTIONS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}順
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="sort-dir"
                onClick={() => update({ dir: desc ? "asc" : "desc" })}
                aria-label={desc ? "逆順にする" : "元の順にする"}
              >
                {desc ? "▼" : "▲"}
              </button>
            </span>
          </div>
        </details>
      </div>
      <div className="filters only-wide">
        <fieldset className="chips" aria-label="イベントの種別">
          {presentTypes.map((t) => (
            <label key={t} className="chip">
              <input type="checkbox" checked={selectedTypes.has(t)} onChange={() => toggleType(t)} />
              {EVENT_TYPE_LABEL[t]}
            </label>
          ))}
          {hasCollab && (
            <label className="chip chip-option" title="他グループとのコラボステージでの歌唱も集計に含める">
              <input type="checkbox" checked={includeCollab} onChange={() => update({ collab: includeCollab ? null : "1" })} />
              コラボステージを含む
            </label>
          )}
        </fieldset>
        <div className="filter-row">
          <select value={era} onChange={(e) => update({ era: e.target.value })} aria-label="区分" className={era ? "is-set" : undefined}>
            <option value="">すべての区分</option>
            {eraOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <select
            value={unit}
            onChange={(e) => update({ unit: e.target.value })}
            aria-label="オリジナル"
            className={unit ? "is-set" : undefined}
          >
            <option value="">すべてのオリジナル</option>
            {artist.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <input type="search" placeholder="曲名・作詞・作曲・編曲で絞り込み" value={q} onChange={(e) => update({ q: e.target.value })} />
        </div>
      </div>

      <div className="song-rows-wrap only-narrow">
        {rows.length === 0 && <p className="empty-row">{emptyMessage}</p>}
        <ol className="song-rows">
          {visibleRows.map((s, i) => {
            const f = figures(s, sortKey, today);
            return (
              <li
                key={s.song.id}
                className={s.count === 0 ? "song-row unplayed" : "song-row"}
                style={{ "--rate": s.count > 0 ? s.rate : 0 } as React.CSSProperties}
              >
                <span className="song-row-rank">{s.count > 0 ? i + 1 : "–"}</span>
                <span className="song-row-main">
                  <Link to={s.song.id} className="song-title">
                    {s.song.title}
                  </Link>
                  {hasBadges(s) && meta(s)}
                </span>
                <span className="song-row-figures">
                  <span className="song-row-value">{f.main}</span>
                  {f.sub.length > 0 && <span className="song-row-sub">{f.sub.join(" · ")}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        {unplayedToggle && <div className="song-rows-toggle">{unplayedToggle}</div>}
      </div>
      <div className="table-wrap only-wide">
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
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visibleRows.map((s, i) => (
              <tr key={s.song.id} className={s.count === 0 ? "unplayed" : undefined}>
                <td className="rank">{s.count > 0 ? i + 1 : "–"}</td>
                <td className="title">
                  <Link to={s.song.id} className="song-title">
                    {s.song.title}
                  </Link>
                  {meta(s)}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={[c.numeric && "num", c.className].filter(Boolean).join(" ")}>
                    {c.cell(s, today)}
                  </td>
                ))}
              </tr>
            ))}
            {unplayedToggle && (
              <tr className="toggle-row">
                <td colSpan={columns.length + 2}>{unplayedToggle}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {covers.length > 0 && (
        <section className="covers">
          <h3 className="section-heading">
            カバー曲<span className="muted small"> {covers.length} 曲（全イベントの記録）</span>
          </h3>
          <ul className="cover-list">
            {covers.map((s) => (
              <li key={s.song.id}>
                <span className="cover-head">
                  <Link to={s.song.id} className="song-title">
                    {s.song.title}
                  </Link>
                  <span className="muted small">原曲: {s.song.cover!.artist}</span>
                </span>
                <span className="cover-dates">
                  {s.performances.length === 0 && <span className="muted small">未披露</span>}
                  {s.performances.map((p) => (
                    <Link key={`${p.eventId}-${p.stageIndex}-${p.position}`} to={`/${artist.id}/events/${p.eventId}`} className="date-chip">
                      {formatDate(p.date)}
                      {p.collab && <span className="badge collab">コラボ</span>}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted small note">
        集計対象はセトリを登録済みのイベントのみ（{stats.events.length} / {events.filter(isLiveEvent).length} イベント）。
        「歌唱率」は初披露以降のイベントのうち歌唱した割合、「前回から」は最後に歌われてから今日までの日数。
      </p>
    </section>
  );
}
