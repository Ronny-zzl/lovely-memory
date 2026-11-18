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

export type ParsedStage = {
  name?: string;
  /** 見出しの後ろに書かれた補足（例:【1部】もえちゃん考案セトリ → "もえちゃん考案セトリ"） */
  note?: string;
  items: ParsedItem[];
};

// M1_ / M1 / M01. / EN_ / EN1_ / Encore: / WEN_（W アンコール）など
const ITEM_LINE = /^(M|W?\s*EN|EC|W?\s*ENCORE|[WＷ]?\s*アンコール|ダブルアンコール)\s*(\d*)\s*[_＿.．:：\-ー\s)）]\s*(.+)$/i;
// 曲行のように見えるが ITEM_LINE に合わない行（例: XX1_ 曲名）。黙って捨てずに曲として拾い、照合で気付けるようにする
const ITEM_LIKE_LINE = /^[A-Za-zＡ-Ｚａ-ｚ]{1,8}\s*\d*\s*[_＿]\s*\S/;
// 単独の行で書かれたアンコールの区切り（アンコール / -EN- / 【アンコール】 / 🎵ENCORE🎵 / Wアンコール など）
const ENCORE_WORD = /^(W|Ｗ|ダブル)?(EN|ENCORE|アンコール)$/i;

/** アンコールの区切り行か（記号・括弧・絵文字を除いて「アンコール」「EN」などだけが残る行） */
export function isEncoreMarker(line: string): boolean {
  return ENCORE_WORD.test(line.replace(/[^\p{L}\p{N}]/gu, ""));
}
// 【1部】や【1部】もえちゃん考案セトリ❤️ のように、見出しの後ろに補足が続くこともある
const STAGE_HEADER = /^[【[［](.+?)[】\]］]\s*(.*)$/;
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
 * - EN_ / EN1_ などの行と、「アンコール」「-EN-」「【アンコール】」などの区切り行より後（同じステージ内）はアンコール
 * - ステージが 1 つだけの場合は名前を付けない（冒頭の【セットリスト】などを拾わないため）
 * - それ以外の行（イベント名・ハッシュタグ等）は無視
 * - 曲番号が 1 つも無い場合は、曲名を 1 行ずつ並べた形式として読む（parseUnnumbered）
 */
export function parseSetlistText(text: string): ParsedStage[] {
  const stages: ParsedStage[] = [];
  let pendingHeader: string | undefined;
  let pendingNote: string | undefined;
  let current: ParsedStage | undefined;
  let lastItem: (ParsedItem & { creditText: string[] }) | undefined;
  // 区切り行（アンコール / -EN- など）を見た後か。次のステージが始まったら戻す
  let afterEncoreMarker = false;
  const all: Array<ParsedItem & { creditText: string[] }> = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // 【アンコール】も見出しの形だが、ステージ名ではなくアンコールの区切り
    if (isEncoreMarker(line)) {
      afterEncoreMarker = true;
      lastItem = undefined;
      continue;
    }

    const header = line.match(STAGE_HEADER);
    if (header) {
      pendingHeader = header[1]!.trim();
      pendingNote = header[2]!.trim() || undefined;
      lastItem = undefined;
      continue;
    }

    const m = line.match(ITEM_LINE) ?? (current && ITEM_LIKE_LINE.test(line) ? [line, "?", "", line] : null);
    if (m) {
      const kind = m[1]!.toUpperCase();
      const num = m[2] ? Number(m[2]) : undefined;
      const marked = kind !== "M" && kind !== "?";
      const startsNew = !current || (kind === "M" && num === 1 && current.items.length > 0);
      if (startsNew) {
        current = { name: pendingHeader, ...(pendingNote && { note: pendingNote }), items: [] };
        stages.push(current);
        pendingHeader = undefined;
        pendingNote = undefined;
        afterEncoreMarker = false;
      }
      const encore = marked || afterEncoreMarker;
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
  // 曲番号の無い告知（曲名を 1 行ずつ並べただけの形式）
  if (stages.length === 0) return parseUnnumbered(text);

  // 1 ステージだけなら冒頭の【セットリスト】等を拾っているだけなので、名前も補足も捨てる
  if (stages.length === 1) {
    delete stages[0]!.name;
    delete stages[0]!.note;
  }
  return stages;
}

const ANNOUNCE_LINE = /セトリ|セットリスト|set\s*list/i;
const MC_LINE = /^[<＜(（［[].{0,10}[>＞)）］\]]$/;

/**
 * 曲番号の無い告知文を解析する（「曲名」を 1 行ずつ並べた形式）。
 * セトリ見出し行・ハッシュタグ・<MC>・クレジット行・【】見出しを除いた各行を 1 曲とみなす。
 * 曲名以外の行が紛れ込んでも、songs.json との照合で「不明な曲」として検出される。
 */
function parseUnnumbered(text: string): ParsedStage[] {
  const items: ParsedItem[] = [];
  let encore = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (isEncoreMarker(line)) {
      encore = true;
      continue;
    }
    if (ANNOUNCE_LINE.test(line) || MC_LINE.test(line) || CREDIT_LINE.test(line) || STAGE_HEADER.test(line)) continue;
    const label = line.replace(/\s+#\S+/g, "").trim();
    items.push({ label, ...splitTags(label), encore, credits: {} });
  }
  return items.length ? [{ items }] : [];
}

/** 曲番号（M1_ など）付きの曲行があるか */
export function hasNumberedItems(text: string): boolean {
  return text.split(/\r?\n/).some((l) => ITEM_LINE.test(l.trim()));
}

/** セトリ告知らしい見出し（セトリ・セットリスト等）があるか */
export function looksLikeSetlistAnnouncement(text: string): boolean {
  return ANNOUNCE_LINE.test(text);
}

/** 曲名（告知文の表記）から songs.json の曲を探す。タグ付きの表記 → タグ除去後の順に試す */
export function findSong(songs: Song[], item: Pick<ParsedItem, "label" | "title">): Song | undefined {
  const keys = [normalizeTitle(item.label), normalizeTitle(item.title)];
  for (const key of keys) {
    const hit = songs.find((s) => normalizeTitle(s.title) === key || s.aliases.some((a) => normalizeTitle(a) === key));
    if (hit) return hit;
  }
  return undefined;
}
