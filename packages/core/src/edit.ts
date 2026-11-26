/*
 * 入力画面（プレビュー版のサイト）から送るセトリの内容。
 * サイト → Worker（/api/edit、Cloudflare Access の認証を確かめる）→ GitHub Actions（apply-edit.yml）→ CLI の apply-edit が
 * これを確かめて artists/<id>/ に書き込み、コミットする。
 *
 * 形はセトリ（schema.ts の SetlistFields・SetlistStage・SetlistItemDetail）から作る。セトリに項目を足せば、ここにも自動で入る
 * （別々に書いていたころ、コラボステージの印・一緒に歌った人を足し忘れて、保存し直すと消えていた）。
 * ここで足すのは、外から届くものとしての長さの上限と、入力画面だけの項目（artist・newSongs）。
 * セトリ ⇄ 入力画面 ⇄ 送る内容 の変換は edit-convert.ts。
 */
import { z } from "zod";
import { SetlistFields, SetlistItemDetail, SetlistStage } from "./schema.ts";

const slug = z.string().regex(/^[a-z0-9-]+$/);

export const EditItem = SetlistItemDetail.extend({
  /** songs.json の曲名（別表記でもよい）。思い出せない曲は "?"、新しく足す曲は newSongs にも書く */
  song: z.string().min(1).max(200),
  note: z.string().max(200).optional(),
  members: z.array(slug).max(20).optional(),
  with: z.array(z.string().min(1).max(100)).max(30).optional(),
});
export type EditItem = z.infer<typeof EditItem>;

export const EditStage = SetlistStage.extend({
  name: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
  items: z.array(EditItem).max(100),
});
export type EditStage = z.infer<typeof EditStage>;

export const EditPayload = SetlistFields.omit({ items: true, stages: true }).extend({
  artist: slug,
  stages: z.array(EditStage).min(1).max(10),
  source: z.string().url().max(500).optional(),
  note: z.string().max(500).optional(),
  /** このセトリで初めて出てくる曲（songs.json に足す） */
  newSongs: z
    .array(z.object({ title: z.string().min(1).max(200), cover: z.string().max(100).optional() }))
    .max(20)
    .default([]),
});
/** 送る側（入力画面）の形。newSongs は省略できる */
export type EditPayload = z.input<typeof EditPayload>;
/** 確かめた後（apply-edit）の形 */
export type ParsedEditPayload = z.output<typeof EditPayload>;
