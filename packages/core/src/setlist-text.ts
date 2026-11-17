import { normalizeTitle, parseCredits, type CreditRoles } from "./text.ts";
import type { Song } from "./schema.ts";

export type ParsedItem = {
  /** 告知文での曲名表記（タグを除去する前） */
  label: string;
  /** 末尾の（新曲）などのタグを除いた曲名 */
  title: string;
  /** 末尾の括弧書き（新曲 / short ver. など） */
  tags: string[];
  encore: boolean;
  credits: CreditRoles;
};

export type ParsedStage = { name?: string; items: ParsedItem[] };

// M1_ / M1 / M01. / EN_ / EN1_ / Encore: など
const ITEM_LINE = /^(M|EN|EC|ENCORE|アンコール)\s*(\d*)\s*[_＿.．:：\-ー\s)）]\s*(.+)$/i;
const STAGE_HEADER = /^[【\[［](.+?)[】\]］]$/;
const TRAILING_TAG = /\s*[(（]([^()（）]+)[)）]\s*$/;
const CREDIT_LINE = /作詞|作曲|編曲/;

/** 曲名表記と、末尾の括弧タグを分離する */
export function splitTags(label: string): { title: string; tags: string[] } {
  let title = label.trim();
  const tags: string[] = [];
  for (let m = title.match(TRAILING_TAG); m && m.index! > 0; m = title.match(TRAILING_TAG)) {
    tags.unshift(m[1]!.trim());
    title = title.slice(0, m.index).trim();
  }
  return { title, tags };
}

/**
 * 公式 X のセトリ告知文を解析する。
 *
 * - `M1_ 曲名` 形式の行を 1 曲とみなし、直後の「作詞・作曲…」行をその曲のクレジットとする
 * - 番号が M1 に戻ったら新しいステージ。ステージ名は直前の【…】見出し
 * - ステージが 1 つだけの場合は名前を付けない（冒頭の【セットリスト】などを拾わないため）
 * - それ以外の行（イベント名・ハッシュタグ等）は無視
 */
export function parseSetlistText(text: string): ParsedStage[] {
  const stages: ParsedStage[] = [];
  let pendingHeader: string | undefined;
  let current: ParsedStage | undefined;
  let lastItem: (ParsedItem & { creditText: string[] }) | undefined;
  const all: Array<ParsedItem & { creditText: string[] }> = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const header = line.match(STAGE_HEADER);
    if (header) {
      pendingHeader = header[1]!.trim();
      lastItem = undefined;
      continue;
    }

    const m = line.match(ITEM_LINE);
    if (m) {
      const kind = m[1]!.toUpperCase();
      const num = m[2] ? Number(m[2]) : undefined;
      const encore = kind !== "M";
      const startsNew = !current || (!encore && num === 1 && current.items.length > 0);
      if (startsNew) {
        current = { name: pendingHeader, items: [] };
        stages.push(current);
        pendingHeader = undefined;
      }
      const label = m[3]!.trim();
      const item = { label, ...splitTags(label), encore, credits: {}, creditText: [] as string[] };
      current!.items.push(item);
      all.push(item);
      lastItem = item;
      continue;
    }

    if (lastItem && CREDIT_LINE.test(line)) lastItem.creditText.push(line);
  }

  for (const item of all) {
    item.credits = parseCredits(item.creditText.join("\n"));
    delete (item as Partial<typeof item>).creditText;
  }
  if (stages.length === 1) delete stages[0]!.name;
  return stages;
}

/** 曲名（告知文の表記）から songs.json の曲を探す。タグ付きの表記 → タグ除去後の順に試す */
export function findSong(songs: Song[], item: Pick<ParsedItem, "label" | "title">): Song | undefined {
  const keys = [normalizeTitle(item.label), normalizeTitle(item.title)];
  for (const key of keys) {
    const hit = songs.find(
      (s) => normalizeTitle(s.title) === key || s.aliases.some((a) => normalizeTitle(a) === key),
    );
    if (hit) return hit;
  }
  return undefined;
}
