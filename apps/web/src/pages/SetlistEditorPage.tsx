import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { findSong, normalizeTitle, setlistStages, UNKNOWN_SONG, type EditPayload, type Setlist } from "@lovely-memory/core/runtime";
import { displayTitle, formatDayWithWeekday } from "../format.ts";
import { dotStyle } from "../member-color.ts";
import { useArtistData } from "./ArtistLayout.tsx";
import "./EditPages.css";

/*
 * セトリの入力画面（プレビュー版だけ）。曲をタップして並べ、保存すると /api/edit → GitHub Actions でデータに書き込まれる。
 * 入力の途中はこのブラウザに自動で残し（localStorage）、保存したら消す。
 */

type Row = { key: number; song: string; encore: boolean; note: string; members: string[]; with: string; open: boolean };
type StageState = { name: string; collab: boolean; items: Row[] };
type Completeness = "" | "partial" | "unordered";
type Draft = { stages: StageState[]; completeness: Completeness; source: string; note: string };

let nextKey = 1;
const row = (song: string, extra: Partial<Row> = {}): Row => ({
  key: nextKey++,
  song,
  encore: false,
  note: "",
  members: [],
  with: "",
  open: false,
  ...extra,
});

function fromSetlist(s: Setlist | undefined): Draft {
  if (!s) return { stages: [{ name: "", collab: false, items: [] }], completeness: "", source: "", note: "" };
  return {
    stages: setlistStages(s).map((st) => ({
      name: st.name ?? "",
      collab: !!st.collab,
      items: st.items.map((it) =>
        typeof it === "string"
          ? row(it)
          : row(it.song, { encore: !!it.encore, note: it.note ?? "", members: it.members ?? [], with: (it.with ?? []).join("、") }),
      ),
    })),
    completeness: s.completeness ?? "",
    source: s.source ?? "",
    note: s.note ?? "",
  };
}

/** 「A、B・C, D」→ ["A", "B", "C", "D"] */
const splitNames = (s: string) =>
  s
    .split(/[、,，・\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** 新しいステージを入れる位置。最後にコラボステージが並んでいれば、その前（コラボはふつう最後なので） */
function insertAt(stages: StageState[]): number {
  let at = stages.length;
  while (at > 0 && stages[at - 1]!.collab) at--;
  return at;
}

const draftKey = (artistId: string, eventId: number) => `lovely-memory:edit:${artistId}:${eventId}`;

export function SetlistEditorPage() {
  const { artist, songs, events, setlists, allStats } = useArtistData();
  const eventId = Number(useParams().eventId);
  const event = events.find((e) => e.id === eventId);
  const existing = setlists.find((s) => s.event === eventId);

  const key = draftKey(artist.id, eventId);
  const [draft, setDraft] = useState<Draft>(() => fromSetlist(existing));
  const [saved, setSaved] = useState<Draft | undefined>();
  const [q, setQ] = useState("");
  const [targetStage, setTargetStage] = useState<number | undefined>();
  const [state, setState] = useState<{ kind: "idle" | "saving" | "done" | "error"; message?: string }>({ kind: "idle" });

  // 前回の入力途中の内容（保存前に閉じたとき）。この画面はビルド時の HTML を作らない（ブラウザだけで描く）ので、
  // 最初の描画で localStorage を読んでよい
  const [stored, setStored] = useState<Draft | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return undefined;
      // 古い形（コラボ欄が無いころ）の下書きも読めるように
      const d = JSON.parse(raw) as Draft;
      return {
        ...d,
        stages: d.stages.map((st) => ({ ...st, collab: !!st.collab, items: st.items.map((r) => ({ ...r, with: r.with ?? "" })) })),
      };
    } catch {
      return undefined;
    }
  });

  // 入力の途中を残す（復元するかどうか決める前は上書きしない）
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) return;
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // 保存できない環境では残さない
    }
  }, [draft, key, touched]);

  const update = (f: (d: Draft) => Draft) => {
    setTouched(true);
    setStored(undefined);
    setDraft(f);
  };
  const setItems = (si: number, f: (items: Row[]) => Row[]) =>
    update((d) => ({ ...d, stages: d.stages.map((st, i) => (i === si ? { ...st, items: f(st.items) } : st)) }));

  // 曲の候補：よく歌われている順。検索語があれば曲名・別表記で絞る
  const ranked = useMemo(() => {
    const count = new Map(allStats.songs.map((s) => [s.song.id, s.count]));
    return [...songs].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  }, [songs, allStats]);
  const nq = normalizeTitle(q);
  const candidates = nq ? ranked.filter((s) => [s.title, ...s.aliases].some((t) => normalizeTitle(t).includes(nq))) : ranked;
  const exact = q.trim() ? findSong(songs, { label: q.trim(), title: q.trim() }) : undefined;

  // 曲を足す先のステージ（選んでいなければ最後のステージ）
  const target = targetStage !== undefined && targetStage < draft.stages.length ? targetStage : draft.stages.length - 1;
  const add = (title: string) => {
    setItems(target, (items) => [...items, row(title)]);
    setQ("");
  };

  if (!event) return <p className="muted">イベントが見つかりません。</p>;
  const eventMembers = artist.members.filter((m) => event.members.includes(m.id));
  const isNew = (title: string) => title !== UNKNOWN_SONG && !findSong(songs, { label: title, title });
  const newSongs = [...new Set(draft.stages.flatMap((st) => st.items.map((r) => r.song)).filter(isNew))];
  const total = draft.stages.reduce((n, st) => n + st.items.length, 0);

  const save = async () => {
    const payload: EditPayload = {
      artist: artist.id,
      event: event.id,
      stages: draft.stages.map((st) => ({
        ...(st.name.trim() && { name: st.name.trim() }),
        ...(st.collab && { collab: true }),
        items: st.items.map((r) => ({
          song: r.song,
          ...(r.encore && { encore: true }),
          ...(r.note.trim() && { note: r.note.trim() }),
          ...(r.members.length > 0 && { members: r.members }),
          ...(st.collab && splitNames(r.with).length > 0 && { with: splitNames(r.with) }),
        })),
      })),
      ...(draft.completeness && { completeness: draft.completeness }),
      ...(draft.source.trim() && { source: draft.source.trim() }),
      ...(draft.note.trim() && { note: draft.note.trim() }),
      newSongs: newSongs.map((title) => ({ title })),
    };
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      try {
        localStorage.removeItem(key);
      } catch {
        // 消せなくても保存はできている
      }
      setTouched(false);
      setSaved(draft);
      setState({ kind: "done" });
    } catch (e) {
      setState({
        kind: "error",
        message: `保存できませんでした：${e instanceof Error ? e.message : String(e)}（入力した内容はこのブラウザに残っています）`,
      });
    }
  };

  return (
    <article className="setlist-editor">
      <Link to=".." relative="path" className="back-link">
        ← 入力するイベントの一覧
      </Link>
      <header className="editor-head">
        <p className="muted small">{formatDayWithWeekday(event.date)}</p>
        <h2 className="editor-title">{displayTitle(event.title, artist.name)}</h2>
        <p className="small">
          <Link to={`/${artist.id}/events/${event.id}`}>イベントのページ</Link>
          {existing && <span className="muted"> ・ 入力済みのセトリを編集しています</span>}
        </p>
      </header>

      {stored && (
        <div className="editor-restore" role="note">
          <span>保存する前の入力が残っています。</span>
          <button
            type="button"
            className="share-button primary"
            onClick={() => {
              setDraft(stored);
              setStored(undefined);
              setTouched(true);
            }}
          >
            続きから
          </button>
          <button
            type="button"
            className="share-button"
            onClick={() => {
              setStored(undefined);
              try {
                localStorage.removeItem(key);
              } catch {
                // 消せなくてもよい
              }
            }}
          >
            捨てる
          </button>
        </div>
      )}

      {draft.stages.map((st, si) => {
        let encoreNo = 0;
        const encores = st.items.filter((r) => r.encore).length;
        return (
          <section key={si} className={draft.stages.length > 1 && si === target ? "editor-stage target" : "editor-stage"}>
            {(draft.stages.length > 1 || st.name || st.collab) && (
              <div className="editor-stage-head">
                <input
                  type="text"
                  placeholder={`ステージ ${si + 1} の名前（任意）`}
                  value={st.name}
                  onChange={(e) =>
                    update((d) => ({ ...d, stages: d.stages.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)) }))
                  }
                />
                <label className="chip">
                  <input
                    type="checkbox"
                    checked={st.collab}
                    onChange={() => update((d) => ({ ...d, stages: d.stages.map((x, i) => (i === si ? { ...x, collab: !x.collab } : x)) }))}
                  />
                  コラボ
                </label>
                {draft.stages.length > 1 && (
                  <button
                    type="button"
                    className={si === target ? "share-button primary" : "share-button"}
                    aria-pressed={si === target}
                    onClick={() => setTargetStage(si)}
                  >
                    {si === target ? "曲の追加先" : "ここに追加"}
                  </button>
                )}
                {st.items.length === 0 && (
                  <button
                    type="button"
                    className="share-button"
                    onClick={() => {
                      update((d) => ({ ...d, stages: d.stages.filter((_, i) => i !== si) }));
                      setTargetStage(undefined);
                    }}
                  >
                    ステージを消す
                  </button>
                )}
              </div>
            )}
            {st.items.length === 0 ? (
              <p className="muted small editor-empty">下の曲をタップして、歌われた順に並べてください。</p>
            ) : (
              <ol className="editor-items">
                {st.items.map((r, i) => {
                  const no = r.encore ? (encores > 1 ? `EN${++encoreNo}` : "EN") : `M${i + 1}`;
                  const unknown = r.song === UNKNOWN_SONG;
                  const move = (to: number) =>
                    setItems(si, (items) => {
                      const next = [...items];
                      next.splice(to, 0, next.splice(i, 1)[0]!);
                      return next;
                    });
                  const set = (patch: Partial<Row>) =>
                    setItems(si, (items) => items.map((x) => (x.key === r.key ? { ...x, ...patch } : x)));
                  return (
                    <li key={r.key} className={r.encore ? "encore" : undefined}>
                      <div className="editor-row">
                        <span className="item-no">{no}</span>
                        <span className="editor-song">
                          {unknown ? <span className="muted">？ 思い出せない曲</span> : r.song}
                          {isNew(r.song) && <span className="badge editor-new">新しい曲</span>}
                          {r.members.length > 0 && (
                            <span className="editor-row-members">
                              {r.members.map((m) => {
                                const member = artist.members.find((x) => x.id === m);
                                return member ? <span key={m} className="dot" style={dotStyle(member.color)} title={member.name} /> : null;
                              })}
                            </span>
                          )}
                          {r.note && <span className="muted small"> {r.note}</span>}
                          {st.collab && splitNames(r.with).length > 0 && (
                            <span className="muted small"> with {splitNames(r.with).length} 人</span>
                          )}
                        </span>
                        <span className="editor-row-actions">
                          <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i - 1)}>
                            ↑
                          </button>
                          <button type="button" aria-label="下へ" disabled={i === st.items.length - 1} onClick={() => move(i + 1)}>
                            ↓
                          </button>
                          <button
                            type="button"
                            aria-pressed={r.encore}
                            className={r.encore ? "on" : undefined}
                            onClick={() => set({ encore: !r.encore })}
                          >
                            EN
                          </button>
                          <button type="button" aria-expanded={r.open} aria-label="メモ・メンバー" onClick={() => set({ open: !r.open })}>
                            …
                          </button>
                          <button
                            type="button"
                            aria-label="消す"
                            onClick={() => setItems(si, (items) => items.filter((x) => x.key !== r.key))}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                      {r.open && (
                        <div className="editor-row-more">
                          <input
                            type="text"
                            placeholder="メモ（short ver. など）"
                            value={r.note}
                            onChange={(e) => set({ note: e.target.value })}
                          />
                          <div className="chips" role="group" aria-label="歌ったメンバー（一部のメンバーだけのとき）">
                            {eventMembers.map((m) => (
                              <label key={m.id} className="chip">
                                <input
                                  type="checkbox"
                                  checked={r.members.includes(m.id)}
                                  onChange={() =>
                                    set({ members: r.members.includes(m.id) ? r.members.filter((x) => x !== m.id) : [...r.members, m.id] })
                                  }
                                />
                                <span className="dot" style={dotStyle(m.color)} />
                                {m.name}
                              </label>
                            ))}
                          </div>
                          <p className="muted small">一部のメンバーだけで歌った曲のときだけ選んでください（全員なら選ばない）。</p>
                          {st.collab && (
                            <input
                              type="text"
                              placeholder="一緒に歌った人（「、」区切り）"
                              value={r.with}
                              onChange={(e) => set({ with: e.target.value })}
                            />
                          )}
                          {i < st.items.length - 1 && (
                            // 途中から登場するメンバーがいるときなど、続く何曲かが同じメンバーのときに
                            <button
                              type="button"
                              className="share-button editor-copy-members"
                              onClick={() =>
                                setItems(si, (items) =>
                                  items.map((x, j) =>
                                    j === i + 1 ? { ...x, members: [...r.members], open: true } : j === i ? { ...x, open: false } : x,
                                  ),
                                )
                              }
                            >
                              次の曲も同じメンバーにする
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}

      <section className="editor-picker">
        <div className="filters">
          <input type="search" placeholder="曲名で探す（別表記でも）" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="editor-chips">
          {candidates.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => add(s.title)}>
              {s.title}
            </button>
          ))}
          {q.trim() && !exact && (
            <button type="button" className="chip editor-add-new" onClick={() => add(q.trim())}>
              ＋ 新しい曲「{q.trim()}」として追加
            </button>
          )}
          <button type="button" className="chip chip-option" onClick={() => add(UNKNOWN_SONG)}>
            ？ 思い出せない曲
          </button>
        </div>
        <button
          type="button"
          className="share-button editor-add-stage"
          onClick={() => {
            const at = insertAt(draft.stages);
            update((d) => ({ ...d, stages: [...d.stages.slice(0, at), { name: "", collab: false, items: [] }, ...d.stages.slice(at)] }));
            setTargetStage(at);
          }}
        >
          ＋ ステージを分ける（2 部制・別ステージなど）
        </button>
      </section>

      <section className="editor-meta">
        <fieldset className="chips" aria-label="記録の揃い具合">
          {(
            [
              ["", "全曲・曲順とも揃っている"],
              ["partial", "一部の曲だけ"],
              ["unordered", "曲は揃っているが曲順が不明"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="chip">
              <input
                type="radio"
                name="completeness"
                checked={draft.completeness === v}
                onChange={() => update((d) => ({ ...d, completeness: v }))}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="filters">
          <input
            type="url"
            placeholder="出典の URL（ポスト・動画など。任意）"
            value={draft.source}
            onChange={(e) => update((d) => ({ ...d, source: e.target.value }))}
          />
          <textarea
            placeholder="メモ（任意）"
            rows={2}
            value={draft.note}
            onChange={(e) => update((d) => ({ ...d, note: e.target.value }))}
          />
        </div>
      </section>

      <div className="editor-save">
        {newSongs.length > 0 && <p className="small">新しい曲として追加されます：{newSongs.join("・")}</p>}
        <button
          type="button"
          className="share-button primary"
          disabled={total === 0 || state.kind === "saving"}
          onClick={() => void save()}
        >
          {state.kind === "saving" ? "保存しています…" : `保存する（${total} 曲）`}
        </button>
        {state.kind === "done" && saved === draft && (
          <p className="small" role="status">
            ✓ 保存しました。数分でサイトに反映されます。
          </p>
        )}
        {state.kind === "error" && (
          <p className="small error" role="alert">
            {state.message}
          </p>
        )}
      </div>
    </article>
  );
}
