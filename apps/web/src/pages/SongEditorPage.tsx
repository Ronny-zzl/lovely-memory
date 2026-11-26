import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  emptyTieup,
  songDraftProblems,
  songDraftToPayload,
  songToDraft,
  TIEUP_TYPE_LABEL,
  type ReleaseKind,
  type SongDraft,
  type TieupDraft,
  type TieupType,
} from "@lovely-memory/core/runtime";
import { DeployProgress } from "../components/DeployProgress.tsx";
import { useArtistData } from "./ArtistLayout.tsx";
import "./EditPages.css";
import "./SongEditorPage.css";

/** 文字を入れる項目（発売の形・タイアップ以外） */
type TextKey = Exclude<keyof SongDraft, "releaseKind" | "tieups">;

const RELEASE_KINDS: Array<[ReleaseKind, string]> = [
  ["single", "シングル"],
  ["digital", "配信シングル"],
  ["album", "アルバム"],
  ["ep", "EP・ミニアルバム"],
  ["other", "その他（特典 CD など）"],
];

/**
 * 曲の情報の入力画面（プレビュー版だけ）。作詞・作曲・編曲、発売、原曲（カバー曲）、タイアップ、別表記、メモを直す。
 * 保存はセトリと同じ口（/api/edit → apply-edit.yml）。曲名・区分・動画などは CLI（lm song・import-youtube）で。
 */
export function SongEditorPage() {
  const { artist, songs } = useArtistData();
  const songId = useParams().songId;
  const song = songs.find((s) => s.id === songId);
  const [draft, setDraft] = useState<SongDraft | undefined>(() => song && songToDraft(song));
  const [saved, setSaved] = useState<SongDraft>();
  const [state, setState] = useState<{ kind: "idle" | "saving" | "done" | "error"; message?: string; at?: string; actions?: string }>({
    kind: "idle",
  });

  if (!song || !draft) return <p className="muted">曲が見つかりません。</p>;
  const set = (patch: Partial<SongDraft>) => setDraft({ ...draft, ...patch });
  const setTieup = (i: number, patch: Partial<TieupDraft>) =>
    set({ tieups: draft.tieups.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const problems = songDraftProblems(draft);
  const isCover = !!song.cover || !!draft.coverArtist;

  const save = async () => {
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(songDraftToPayload(draft, artist.id, song.id)),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; at?: string; actions?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSaved(draft);
      setState({ kind: "done", at: body.at, actions: body.actions });
    } catch (e) {
      setState({ kind: "error", message: `保存できませんでした：${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const field = (label: string, key: TextKey, placeholder?: string, type = "text") => (
    <label className="song-field">
      <span className="small muted">{label}</span>
      <input type={type} value={draft[key]} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );

  return (
    <article className="setlist-editor song-editor">
      <Link to=".." relative="path" className="back-link">
        ← 曲のページ
      </Link>
      <header className="editor-head">
        <p className="muted small">曲の情報を直す</p>
        <h2 className="editor-title">{song.title}</h2>
        <p className="muted small">曲名・区分・動画はここでは変えられません。</p>
      </header>

      <section className="song-editor-section">
        <h3 className="section-heading">作詞・作曲・編曲</h3>
        <p className="small muted">複数の人は「・」でつなぎます。表記は公式（CD・公式サイト・公式 YouTube）のとおりに。</p>
        <div className="song-fields">
          {field("作詞", "lyrics")}
          {field("作曲", "music")}
          {field("編曲", "arrangement")}
        </div>
      </section>

      <section className="song-editor-section">
        <h3 className="section-heading">発売（初出）</h3>
        <p className="small muted">いちばん早く出たもの（配信が CD より先ならその配信シングル）。発売日を空にすると消えます。</p>
        <div className="song-fields">
          {field("発売日", "releaseDate", undefined, "date")}
          {field("収録作品", "releaseTitle")}
          <label className="song-field">
            <span className="small muted">形</span>
            <select value={draft.releaseKind} onChange={(e) => set({ releaseKind: e.target.value as ReleaseKind })}>
              {RELEASE_KINDS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {field("リンク（任意）", "releaseUrl", "https://", "url")}
        </div>
      </section>

      {isCover && (
        <section className="song-editor-section">
          <h3 className="section-heading">原曲</h3>
          <div className="song-fields">
            {field("原曲のアーティスト", "coverArtist")}
            {field("原曲名（違うときだけ）", "coverTitle")}
            {field("原曲の発売日", "coverReleaseDate", undefined, "date")}
            {field("原曲の収録作品", "coverReleaseTitle")}
            {field("リンク（任意）", "coverReleaseUrl", "https://", "url")}
          </div>
        </section>
      )}

      <section className="song-editor-section">
        <h3 className="section-heading">タイアップ</h3>
        <p className="small muted">例：アニメ『作品名』オープニングテーマ・第3話挿入歌。作品名を空にすると消えます。</p>
        {draft.tieups.map((t, i) => (
          <div key={i} className="song-tieup">
            <select value={t.type} onChange={(e) => setTieup(i, { type: e.target.value as TieupType })} aria-label="種類">
              {Object.entries(TIEUP_TYPE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {k === "other" ? "その他" : label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={t.work}
              placeholder="作品名"
              aria-label="作品名"
              onChange={(e) => setTieup(i, { work: e.target.value })}
            />
            <input
              type="text"
              value={t.role}
              placeholder="使われ方（オープニングテーマなど）"
              aria-label="使われ方"
              onChange={(e) => setTieup(i, { role: e.target.value })}
            />
            <input
              type="url"
              value={t.url}
              placeholder="リンク（任意）"
              aria-label="リンク"
              onChange={(e) => setTieup(i, { url: e.target.value })}
            />
            <button
              type="button"
              className="share-button"
              onClick={() => set({ tieups: draft.tieups.filter((_, j) => j !== i) })}
              aria-label="このタイアップを消す"
            >
              消す
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="share-button" onClick={() => set({ tieups: [...draft.tieups, emptyTieup()] })}>
            ＋ タイアップを足す
          </button>
        </div>
      </section>

      <section className="song-editor-section">
        <h3 className="section-heading">別表記・メモ</h3>
        <label className="song-field">
          <span className="small muted">別表記（セトリ告知での表記ゆれ。1 行に 1 つ）</span>
          <textarea rows={3} value={draft.aliases} onChange={(e) => set({ aliases: e.target.value })} />
        </label>
        <label className="song-field">
          <span className="small muted">メモ（曲のページに出ます）</span>
          <textarea rows={2} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
      </section>

      <div className="editor-save">
        {problems.map((p) => (
          <p key={p} className="small error">
            {p}
          </p>
        ))}
        <button
          type="button"
          className="share-button primary"
          disabled={problems.length > 0 || state.kind === "saving"}
          onClick={() => void save()}
        >
          {state.kind === "saving" ? "保存しています…" : "保存する"}
        </button>
        {state.kind === "done" &&
          saved === draft &&
          (state.at ? (
            <DeployProgress at={state.at} actions={state.actions} href={`/${artist.id}/songs/${song.id}`} linkLabel="曲のページを見る" />
          ) : (
            <p className="small" role="status">
              ✓ 保存しました。数分でサイトに反映されます。
            </p>
          ))}
        {state.kind === "error" && (
          <p className="small error" role="alert">
            {state.message}
          </p>
        )}
      </div>
    </article>
  );
}
