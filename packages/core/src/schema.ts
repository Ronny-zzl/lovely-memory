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
  /** 生年月日（公式プロフィール）。表示は月日と、次の誕生日までの日数 */
  birthday: isoDate.optional(),
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
  /**
   * 楽曲の系統（例: 1期曲 / 2期曲 / カバー）。songs.json の era はこの id を参照する。
   * since を持つ era はインポート時の自動判定に使う（発売日が since 以降で最も新しいもの）。
   */
  eras: z.array(z.object({ id: slug, label: z.string(), since: isoDate.optional() })).default([]),
  /** 楽曲のオリジナル歌唱ユニット */
  units: z
    .array(
      z.object({
        id: slug,
        label: z.string(),
        /** ユニット名の印象に合わせたタグの装飾（任意） */
        motif: z.enum(["sun", "moon"]).optional(),
      }),
    )
    .default([]),
  /** 表示上の既定値。曲の era / unit がこれと同じならバッジを出さない（大多数の曲に同じ印が並ぶのを避ける） */
  defaultEra: slug.optional(),
  defaultUnit: slug.optional(),
  /** 共有ボタン（X）で付けるハッシュタグ（# は付けない） */
  shareHashtags: z.array(z.string()).default([]),
  sources: z.object({
    eventernote: z
      .object({
        actorId: z.number().int(),
      })
      .optional(),
    /** 公式サイトのディスコグラフィ。adapter は packages/cli/src/sources/ 以下の実装名 */
    official: z
      .object({
        adapter: z.string(),
        url: z.string().url(),
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
  /**
   * イベント種別の推定ルール。タイトルにマッチしたルールの種別をすべて付ける（形式・料金・目的は両立しうるため）。
   * どれにも当たらなければ defaultEventType
   */
  eventTypeRules: z
    .array(
      z.object({
        pattern: z.string(),
        /** 1 つでも複数でもよい（例: リリイベは常にフリーライブ → ["release", "free"]） */
        type: z.union([EventType, z.array(EventType).min(1)]),
      }),
    )
    .default([]),
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
      url: z.string().url().optional(),
    })
    .optional(),
  credits: Credits.optional(),
  /** カバー曲の場合の原曲情報（release は原曲の収録作品。この曲自身の release とは別） */
  cover: z
    .object({
      artist: z.string(),
      title: z.string().optional(),
      release: z
        .object({ date: isoDate, title: z.string().optional(), url: z.string().url().optional() })
        .optional(),
    })
    .optional(),
  /** アニメ主題歌などのタイアップ */
  tieups: z
    .array(
      z.object({
        type: z.enum(["anime", "drama", "movie", "game", "cm", "other"]),
        /** 作品名（例: 愚かな天使は悪魔と踊る） */
        work: z.string(),
        /** 使われ方（例: オープニングテーマ） */
        role: z.string().optional(),
        url: z.string().url().optional(),
      }),
    )
    .default([]),
  note: z.string().optional(),
});
export type Song = z.infer<typeof Song>;
export type Tieup = Song["tieups"][number];
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
    // Event の performers は default([]) を持つため、partial() でも未指定時に [] が入り、
    // eventernote の出演者を空で上書きしてしまう。ここでは default なしで定義し直す
    performers: z.array(z.number().int()).optional(),
    /** イベント種別（複数可）。自動推定の結果を丸ごと置き換える */
    types: z.array(EventType).min(1).optional(),
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
  extraEvents: z.array(Event.extend({ types: z.array(EventType).min(1).optional() })).default([]),
});
export type Overrides = z.infer<typeof Overrides>;

// ---------- Setlists (artists/<id>/setlists/<eventId>.yaml, hand-written) ----------

/**
 * 1 曲分。曲名だけなら文字列で書ける。
 * 初披露かどうかは記録せず、集計時に「最初に歌われた公演」として算出する。
 */
export const SetlistItem = z.union([
  z.string(),
  z.object({
    song: z.string(),
    /** 一部メンバーのみで歌唱した場合（member id） */
    members: z.array(slug).optional(),
    encore: z.boolean().optional(),
    /** short ver. / メドレー など */
    note: z.string().optional(),
    /** 一緒に歌った他グループの出演者（コラボステージなど） */
    with: z.array(z.string()).optional(),
  }),
]);
export type SetlistItem = z.infer<typeof SetlistItem>;

export const SetlistStage = z.object({
  /** 対バン・フェスで同一イベント内に複数ステージがある場合のステージ名 */
  name: z.string().optional(),
  /** このステージの出演メンバー（イベント全体と異なる場合のみ） */
  members: z.array(slug).optional(),
  note: z.string().optional(),
  /**
   * 他グループとのコラボステージ（グループとしての出演ではない）。
   * 楽曲統計ではオプションで除外でき、メンバー統計には含める
   */
  collab: z.boolean().optional(),
  items: z.array(SetlistItem),
});
export type SetlistStage = z.infer<typeof SetlistStage>;

/** ステージが 1 つなら items を直接、複数なら stages に書く */
export const Setlist = z
  .object({
    event: z.number().int(),
    source: z.string().url().optional(),
    note: z.string().optional(),
    items: z.array(SetlistItem).optional(),
    stages: z.array(SetlistStage).optional(),
  })
  .refine((s) => (s.items === undefined) !== (s.stages === undefined), {
    message: "items と stages のどちらか一方だけを書いてください",
  });
export type Setlist = z.infer<typeof Setlist>;

