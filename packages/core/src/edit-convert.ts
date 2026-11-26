/*
 * セトリ ⇄ 入力画面の下書き ⇄ 送る内容（EditPayload）の変換。ブラウザ（入力画面）と CLI（apply-edit）の両方で使うので zod は使わない。
 *
 * 入力画面で直せない項目（ステージの出演メンバーなど）も rest に持っておき、保存するときにそのまま戻す。
 * こうしておけば、セトリに項目を足しても、入力画面で保存し直したときに消えない
 * （往返テスト：packages/cli/src/commands/apply-edit.test.ts が、全部のセトリで「セトリ → 下書き → 送る内容 → セトリ」が元に戻ることを確かめる）。
 */
import type { EditPayload, ParsedEditPayload } from "./edit.ts";
import type { Setlist, SetlistItem, SetlistStage } from "./schema.ts";
import { setlistStages, UNKNOWN_SONG } from "./setlist.ts";

type Rest = Record<string, unknown>;

/** 入力画面の 1 曲。open は「…」で詳しい欄を開いているか（保存しない） */
export type DraftRow = {
  key: number;
  song: string;
  encore: boolean;
  note: string;
  members: string[];
  /** 一緒に歌った人（「、」区切りで入力） */
  with: string;
  open: boolean;
  /** 入力画面で直せない項目（そのまま戻す） */
  rest: Rest;
};
export type DraftStage = { name: string; collab: boolean; items: DraftRow[]; rest: Rest };
export type Completeness = "" | "partial" | "unordered";
export type Draft = { stages: DraftStage[]; completeness: Completeness; source: string; note: string; rest: Rest };

let nextKey = 1;
export const draftRow = (song: string, extra: Partial<DraftRow> = {}): DraftRow => ({
  key: nextKey++,
  song,
  encore: false,
  note: "",
  members: [],
  with: "",
  open: false,
  rest: {},
  ...extra,
});
export const emptyStage = (): DraftStage => ({ name: "", collab: false, items: [], rest: {} });

/** 「A、B, C」→ ["A", "B", "C"]（「・」は名前の中に使われることがあるので区切りにしない） */
export const splitNames = (s: string) =>
  s
    .split(/[、,，\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** keys を除いた残り */
function omit(o: object, keys: string[]): Rest {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
}

export function setlistToDraft(s: Setlist | undefined): Draft {
  if (!s) return { stages: [emptyStage()], completeness: "", source: "", note: "", rest: {} };
  return {
    stages: setlistStages(s).map((st) => ({
      name: st.name ?? "",
      collab: !!st.collab,
      rest: omit(st, ["name", "collab", "items"]),
      items: st.items.map((it) =>
        typeof it === "string"
          ? draftRow(it)
          : draftRow(it.song, {
              encore: !!it.encore,
              note: it.note ?? "",
              members: it.members ?? [],
              with: (it.with ?? []).join("、"),
              rest: omit(it, ["song", "encore", "note", "members", "with"]),
            }),
      ),
    })),
    completeness: s.completeness ?? "",
    source: s.source ?? "",
    note: s.note ?? "",
    rest: omit(s, ["event", "items", "stages", "completeness", "source", "note"]),
  };
}

/** 古い形の下書き（このブラウザに残っていたもの）を今の形に */
export function upgradeDraft(d: Draft): Draft {
  return {
    ...d,
    rest: d.rest ?? {},
    stages: d.stages.map((st) => ({
      ...st,
      collab: !!st.collab,
      rest: st.rest ?? {},
      items: st.items.map((r) => ({ ...r, with: r.with ?? "", rest: r.rest ?? {} })),
    })),
  };
}

export function draftToPayload(d: Draft, artist: string, event: number, newSongs: string[]): EditPayload {
  return {
    ...d.rest,
    artist,
    event,
    stages: d.stages.map((st) => ({
      ...st.rest,
      ...(st.name.trim() && { name: st.name.trim() }),
      ...(st.collab && { collab: true }),
      items: st.items.map((r) => ({
        ...r.rest,
        song: r.song,
        ...(r.encore && { encore: true }),
        ...(r.note.trim() && { note: r.note.trim() }),
        ...(r.members.length > 0 && { members: r.members }),
        // コラボステージでないなら一緒に歌った人は無い
        ...(st.collab && splitNames(r.with).length > 0 && { with: splitNames(r.with) }),
      })),
    })),
    ...(d.completeness && { completeness: d.completeness }),
    ...(d.source.trim() && { source: d.source.trim() }),
    ...(d.note.trim() && { note: d.note.trim() }),
    newSongs: newSongs.map((title) => ({ title })),
  };
}

/** 空の項目（undefined・false・空文字・空の配列）を除き、文字列の前後の空白を取る */
export function compact(o: object): Rest {
  const out: Rest = {};
  for (const [k, v] of Object.entries(o)) {
    let x: unknown = v;
    if (typeof x === "string") x = x.trim();
    if (Array.isArray(x)) x = x.map((e: unknown) => (typeof e === "string" ? e.trim() : e)).filter((e: unknown) => e !== "");
    if (x === undefined || x === false || x === "" || (Array.isArray(x) && x.length === 0)) continue;
    out[k] = x;
  }
  return out;
}

/**
 * 送られた内容からセトリを作る（apply-edit）。曲名は canonical で songs.json の正式な表記にそろえ、見つからない曲は unknown に入れる。
 * ステージが 1 つで、名前などの項目も無ければ items に直接書く
 */
export function payloadToSetlist(
  p: ParsedEditPayload,
  canonical: (title: string) => string | undefined,
): { setlist: Setlist; unknown: string[] } {
  const { artist: _artist, newSongs: _newSongs, stages, ...top } = p;
  const unknown: string[] = [];
  const out: SetlistStage[] = stages.map(({ items, ...st }) => ({
    ...compact(st),
    items: items.map(({ song, ...it }): SetlistItem => {
      let title = song.trim();
      if (title !== UNKNOWN_SONG) {
        const found = canonical(title);
        if (found) title = found;
        else unknown.push(title);
      }
      const extra = compact(it);
      return Object.keys(extra).length ? { song: title, ...extra } : title;
    }),
  }));
  const single = out.length === 1 && Object.keys(out[0]!).length === 1;
  const setlist = { ...compact(top), ...(single ? { items: out[0]!.items } : { stages: out }) } as Setlist;
  return { setlist, unknown };
}
