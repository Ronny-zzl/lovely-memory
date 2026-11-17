/**
 * 曲名照合用の正規化。
 * 全角/半角・大文字小文字・空白・波ダッシュ類・記号の表記ゆれを吸収する。
 * 表示には使わない（照合キー専用）。
 */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[〜～~]/g, "~")
    .replace(/[‐‑‒–—―ー−-]/g, "-")
    .replace(/[☆★♡♥・･]/g, "")
    .replace(/[\s　]+/g, "");
}

export type CreditRoles = { lyrics?: string; music?: string; arrangement?: string };

const ROLE_MAP: Record<string, keyof CreditRoles> = {
  作詞: "lyrics",
  作曲: "music",
  編曲: "arrangement",
};

/**
 * 「作詞・作曲：カジ　編曲：tonerico」「作詞：A<br>作曲・編曲：B」のような表記を分解する。
 * 同じ文字列内で同じ役割が二度出てきた場合は先勝ち（Wikipedia の誤記対策）。
 */
export function parseCredits(text: string): CreditRoles {
  const result: CreditRoles = {};
  const cleaned = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/[:：]/g, "：")
    .trim();
  // 「役割(・役割)*：名前」を順に拾う。名前は次の役割表記・改行・全角空白の手前まで
  const re = /((?:作詞|作曲|編曲)(?:[・/／、](?:作詞|作曲|編曲))*)：\s*([^\n]*?)(?=\s*(?:(?:作詞|作曲|編曲)(?:[・/／、](?:作詞|作曲|編曲))*：|\n|$))/g;
  for (const m of cleaned.matchAll(re)) {
    const roles = m[1]!.split(/[・/／、]/);
    const name = m[2]!.replace(/[\s　]+$/u, "").replace(/^[\s　]+/u, "");
    if (!name) continue;
    for (const r of roles) {
      const key = ROLE_MAP[r];
      if (key && result[key] === undefined) result[key] = name;
    }
  }
  return result;
}
