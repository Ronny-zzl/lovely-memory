/*
 * 曲の情報の入力画面（プレビュー版のサイト）から送る内容。
 * サイト → Worker（/api/edit。セトリと同じ口）→ GitHub Actions（apply-edit.yml）→ CLI の apply-edit が type: "song" を見て
 * これを確かめ、songs.json のその曲を書き換えてコミットする。
 *
 * 直せるのは作詞・作曲・編曲、発売、原曲（カバー）、タイアップ、別表記、メモ。送った項目で丸ごと置き換える（空なら消す）。
 * 曲名・区分・ユニット・動画などはここでは変えない（曲名を変えるとセトリの照合に関わるため、CLI の lm song で）。
 * 曲 ⇄ 入力画面 ⇄ 送る内容 の変換は song-edit-convert.ts。
 */
import { z } from "zod";
import { Song } from "./schema.ts";

const slug = z.string().regex(/^[a-z0-9-]+$/);
const text = (max: number) => z.string().max(max);
const SongShape = Song.shape;

export const SongEditPayload = z.object({
  type: z.literal("song"),
  artist: slug,
  id: slug,
  credits: z.object({ lyrics: text(200).optional(), music: text(200).optional(), arrangement: text(200).optional() }).optional(),
  release: SongShape.release
    .unwrap()
    .extend({ title: text(200) })
    .optional(),
  cover: SongShape.cover
    .unwrap()
    .extend({
      artist: text(200),
      title: text(200).optional(),
      release: SongShape.cover
        .unwrap()
        .shape.release.unwrap()
        .extend({ title: text(200).optional() })
        .optional(),
    })
    .optional(),
  tieups: z.array(SongShape.tieups.unwrap().element.extend({ work: text(200), role: text(100).optional() })).max(10),
  aliases: z.array(text(200).min(1)).max(20),
  note: text(500).optional(),
});
/** 送る側（入力画面）の形 */
export type SongEditPayload = z.input<typeof SongEditPayload>;
/** 確かめた後（apply-edit）の形 */
export type ParsedSongEditPayload = z.output<typeof SongEditPayload>;
