import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, "HH:MM");
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

// ---------- Artist config (artists/<id>/artist.json) ----------

export const EventType = z.enum([
  "oneman", // 単独公演・デビューLIVE・主催ワンマン
  "taiban", // 主催対バン
  "external", // 外部対バン・フェス
  "release", // リリースイベント（ミニライブ）
  "free", // フリーライブ
  "tokuten", // チェキ会など、ライブなし → 統計対象外
]);
export type EventType = z.infer<typeof EventType>;

export const Member = z.object({
  id: slug,
  name: z.string(),
  colorName: z.string().optional(),
  color: hexColor,
  eventernoteId: z.number().int().optional(),
});
export type Member = z.infer<typeof Member>;

export const ArtistConfig = z.object({
  id: slug,
  name: z.string(),
  /** 同じグループの中の「期」などを区別するための表示用サブタイトル */
  subtitle: z.string().optional(),
  /** この日以降のイベントのみを対象にする */
  since: isoDate.optional(),
  until: isoDate.optional(),
  members: z.array(Member),
  /** 楽曲の系統（例: 1期曲 / 2期曲）。songs.json の era はこの id を参照する */
  eras: z.array(z.object({ id: slug, label: z.string() })).default([]),
  /** 楽曲のオリジナル歌唱ユニット */
  units: z.array(z.object({ id: slug, label: z.string() })).default([]),
  sources: z.object({
    eventernote: z
      .object({
        actorId: z.number().int(),
      })
      .optional(),
    /** 楽曲リストの初期インポート元（ディスコグラフィ節を解析） */
    wikipedia: z
      .object({
        lang: z.string().default("ja"),
        title: z.string(),
      })
      .optional(),
  }),
  /** タイトルにマッチした最初のルールでイベント種別を推定する。どれにも当たらなければ defaultEventType */
  eventTypeRules: z.array(z.object({ pattern: z.string(), type: EventType })).default([]),
  defaultEventType: EventType.default("external"),
});
export type ArtistConfig = z.infer<typeof ArtistConfig>;

// ---------- Songs (artists/<id>/songs.json) ----------

export const Credits = z.object({
  lyrics: z.string().optional(),
  music: z.string().optional(),
  arrangement: z.string().optional(),
});

export const Song = z.object({
  id: slug,
  title: z.string(),
  /** セトリ告知での表記ゆれ。照合時は正規化した上で比較する */
  aliases: z.array(z.string()).default([]),
  era: slug.optional(),
  unit: slug.optional(),
  release: z
    .object({
      date: isoDate,
      title: z.string(),
      kind: z.enum(["ep", "single", "digital", "album", "other"]),
    })
    .optional(),
  credits: Credits.optional(),
});
export type Song = z.infer<typeof Song>;
export const SongList = z.array(Song);

// ---------- Events (artists/<id>/events.json, generated) ----------

export const Event = z.object({
  /** eventernote の event id。手動追加イベントは負数などで衝突を避ける */
  id: z.number().int(),
  date: isoDate,
  title: z.string(),
  venue: z.object({ id: z.number().int().optional(), name: z.string() }).optional(),
  open: hhmm.optional(),
  start: hhmm.optional(),
  end: hhmm.optional(),
  /** eventernote の actor id */
  performers: z.array(z.number().int()).default([]),
});
export type Event = z.infer<typeof Event>;
export const EventList = z.array(Event);

// ---------- Overrides (artists/<id>/overrides.json, hand-written) ----------

export const EventOverride = Event.partial()
  .omit({ id: true })
  .extend({
    type: EventType.optional(),
    /** 出演メンバー（member id）。eventernote の情報より優先 */
    members: z.array(slug).optional(),
    /** true なら一覧から除外 */
    hidden: z.boolean().optional(),
    note: z.string().optional(),
  });
export type EventOverride = z.infer<typeof EventOverride>;

export const Overrides = z.object({
  events: z.record(z.string(), EventOverride).default({}),
  /** eventernote に載っていないイベントを手動で追加 */
  extraEvents: z.array(Event.extend({ type: EventType.optional() })).default([]),
});
export type Overrides = z.infer<typeof Overrides>;

// ---------- Setlists (artists/<id>/setlists/<eventId>.yaml, hand-written) ----------

export const SetlistItem = z.union([
  z.string(),
  z.object({
    song: z.string(),
    debut: z.boolean().optional(),
    members: z.array(slug).optional(),
    note: z.string().optional(),
  }),
]);
export type SetlistItem = z.infer<typeof SetlistItem>;

export const Setlist = z.object({
  event: z.number().int(),
  source: z.string().url().optional(),
  note: z.string().optional(),
  items: z.array(SetlistItem),
});
export type Setlist = z.infer<typeof Setlist>;
