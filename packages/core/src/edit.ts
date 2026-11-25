/*
 * 入力画面（プレビュー版のサイト）から送るセトリの内容。
 * サイト → Worker（/api/edit、Cloudflare Access の認証を確かめる）→ GitHub Actions（apply-edit.yml）→ CLI の apply-edit が
 * これを確かめて artists/<id>/ に書き込み、コミットする。
 */
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9-]+$/);

export const EditItem = z.object({
  /** songs.json の曲名（別表記でもよい）。思い出せない曲は "?"、新しく足す曲は newSongs にも書く */
  song: z.string().min(1).max(200),
  encore: z.boolean().optional(),
  note: z.string().max(200).optional(),
  /** 一部のメンバーだけで歌った曲（member id） */
  members: z.array(slug).max(20).optional(),
});
export type EditItem = z.infer<typeof EditItem>;

export const EditPayload = z.object({
  artist: slug,
  event: z.number().int(),
  stages: z
    .array(z.object({ name: z.string().max(100).optional(), items: z.array(EditItem).max(100) }))
    .min(1)
    .max(10),
  completeness: z.enum(["partial", "unordered"]).optional(),
  source: z.string().url().max(500).optional(),
  note: z.string().max(500).optional(),
  /** このセトリで初めて出てくる曲（songs.json に足す） */
  newSongs: z
    .array(z.object({ title: z.string().min(1).max(200), cover: z.string().max(100).optional() }))
    .max(20)
    .default([]),
});
export type EditPayload = z.input<typeof EditPayload>;
