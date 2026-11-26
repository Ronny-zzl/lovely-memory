import { z } from "zod";
import { ARTIST_THEMES } from "./theme.ts";

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
  "talk", // トークステージ・トークショーなど、ライブなし → 統計対象外
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
  /** 加入日（途中加入のメンバー）。この日より前のイベントには出演していないものとして扱う */
  since: isoDate.optional(),
  /** 最後に活動した日（卒業・休止）。この日より後のイベントには出演していないものとして扱う */
  until: isoDate.optional(),
  /** until を過ぎた後、名前の横に出す言葉（例: 活動休止中・卒業）。無ければ「活動終了」 */
  untilLabel: z.string().optional(),
});
export type Member = z.infer<typeof Member>;

export const ArtistConfig = z.object({
  id: slug,
  name: z.string(),
  /** 同じグループの中の「期」などを区別するための表示用サブタイトル */
  subtitle: z.string().optional(),
  /** ファンがよく使う略称（検索エンジン向けにトップ・一覧ページのタイトルや説明に入れる） */
  aliases: z.array(z.string()).optional(),
  /** この日以降のイベントのみを対象にする */
  since: isoDate.optional(),
  until: isoDate.optional(),
  /**
   * 下書き（記録がまだ揃っていない）。公開サイトのビルドには含めず、確認用のプレビュー（Cloudflare Access で保護）にだけ出す。
   * ビルド時に INCLUDE_DRAFTS=1 のときだけ含める
   */
  draft: z.boolean().optional(),
  /** 見た目（サイトの配色・共有画像）。theme.ts。無ければ sun-moon（太陽と月） */
  theme: z.enum(ARTIST_THEMES).default("sun-moon"),
  /**
   * 曲として扱わない収録曲（入場 SE・インスト・ボイスドラマなど）。Wikipedia・公式サイトから曲を取り込むときに足さない
   */
  ignoredTracks: z.array(z.string()).optional(),
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
  /**
   * 衣装。イベントごとに指定が無ければ、その日までに始まった通常衣装（special でないもの）のうち最新のものを着ていたとみなす。
   * 特別な衣装（ハロウィンなど）は overrides.json の events.<id>.costume で指定する
   */
  costumes: z
    .array(
      z.object({
        id: slug,
        name: z.string(),
        /** 通常衣装として着始めた日 */
        since: isoDate.optional(),
        /** そのイベントだけの特別な衣装（既定にはならない） */
        special: z.boolean().default(false),
        note: z.string().optional(),
      }),
    )
    .default([]),
  /** 共有ボタン（X）で付けるハッシュタグ（# は付けない） */
  shareHashtags: z.array(z.string()).default([]),
  /**
   * 複数人の共同名義（作詞・作曲・編曲）。名義 → メンバー名。
   * songs.json の表記は公式のまま名義で書き、楽曲の絞り込みでメンバー名からも見つかるようにする
   */
  creditGroups: z.record(z.string(), z.array(z.string()).min(1)).default({}),
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
    /** セトリを告知する公式 X アカウント（watch-x が読む）。userId は数字の id（ユーザー名の変更に影響されない） */
    x: z
      .object({
        username: z.string(),
        userId: z.string().regex(/^\d+$/),
      })
      .optional(),
    /** 公式 YouTube チャンネル（import-youtube が曲ページの動画を集める） */
    youtube: z
      .object({
        channelId: z.string().regex(/^UC[\w-]{22}$/),
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
      release: z.object({ date: isoDate, title: z.string().optional(), url: z.string().url().optional() }).optional(),
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
  /** 公式 YouTube の動画（MV・ライブ映像など）。曲ページで新しい順に並べる */
  videos: z
    .array(
      z.object({
        /** YouTube の動画 id */
        id: z.string().regex(/^[\w-]{11}$/),
        kind: z.enum(["mv", "live", "dance", "parts"]),
        /** ライブ映像は公演日、それ以外は公開日 */
        date: isoDate,
        /** 補足（ライブ映像の公演名、MV の別バージョン名など） */
        label: z.string().optional(),
      }),
    )
    .default([]),
  note: z.string().optional(),
});
export type Song = z.infer<typeof Song>;
export type SongVideo = Song["videos"][number];
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
    /** このイベントの衣装（artist.json の costumes の id）。通常衣装でないときに指定する */
    costume: slug.optional(),
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
 * 初披露かどうかは記録せず、集計時に「最初に歌われたイベント」として算出する。
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
    /**
     * 記録の揃い具合（公式の告知が無く、ファンの記憶などから入れたとき）。無ければ全曲・曲順とも揃っている。
     * - partial: 一部の曲だけ（抜けがある）
     * - unordered: 曲は揃っているが曲順が分からない
     * どちらも歌唱回数・歌唱率には数え、曲順の傾向（1 曲目・ラスト・つながり）には使わない
     */
    completeness: z.enum(["partial", "unordered"]).optional(),
    items: z.array(SetlistItem).optional(),
    stages: z.array(SetlistStage).optional(),
  })
  .refine((s) => (s.items === undefined) !== (s.stages === undefined), {
    message: "items と stages のどちらか一方だけを書いてください",
  });
export type Setlist = z.infer<typeof Setlist>;
