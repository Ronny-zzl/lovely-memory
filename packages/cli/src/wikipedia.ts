import { parseCredits, type CreditRoles } from "@lovely-memory/core";

export type ReleaseKind = "ep" | "single" | "digital" | "album" | "other";

export type ParsedTrack = {
  title: string;
  credits: CreditRoles;
  unitLabel?: string;
  release: { date: string; title: string; kind: ReleaseKind };
};

/** [[a|b]] → b、[[a]] → a、'''x''' → x、<ref>…</ref> と単純なタグを除去 */
export function stripWikiMarkup(s: string): string {
  return s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<(?!br)[^>]+>/gi, "")
    .trim();
}

function kindFromHeading(h: string): ReleaseKind | undefined {
  if (/配信/.test(h)) return "digital";
  if (/シングル/.test(h)) return "single";
  if (/EP|ミニアルバム/.test(h)) return "ep";
  if (/アルバム/.test(h)) return "album";
  return undefined;
}

const INSTRUMENTAL = /[(（]\s*(instrumental|off\s*vocal|inst\.?)\s*[)）]/i;

/**
 * 日本語版 Wikipedia のアーティスト記事の「ディスコグラフィ」節から収録曲を取り出す。
 * 対応している表の形:
 *  - 収録曲セルに `#曲名` と（任意で）続く `#: 作詞：…` を並べる形（EP・CDシングル）
 *  - 1 行 = 1 曲で、タイトルセル `'''曲名'''` と作家セルを持つ形（配信シングル）
 */
export function parseDiscography(wikitext: string, unitLabels: string[]): ParsedTrack[] {
  const start = wikitext.search(/^==\s*ディスコグラフィ\s*==\s*$/m);
  if (start < 0) throw new Error("ディスコグラフィ section not found");
  const rest = wikitext.slice(start + 1);
  const endRel = rest.search(/^==[^=].*==\s*$/m);
  const section = endRel < 0 ? rest : rest.slice(0, endRel);

  const tracks: ParsedTrack[] = [];
  let kind: ReleaseKind = "other";
  let row: string[] = [];

  const flushRow = () => {
    if (row.length === 0) return;
    const text = row.join("\n");
    row = [];
    const date = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    const releaseTitle = text.match(/'''(.+?)'''/);
    if (!date || !releaseTitle) return;
    const iso = `${date[1]}-${date[2]!.padStart(2, "0")}-${date[3]!.padStart(2, "0")}`;
    const release = { date: iso, title: stripWikiMarkup(releaseTitle[1]!), kind };

    const cells = text.split("\n").map((l) => l.replace(/^[|!]\s*/, "").trim());
    const unitLabel = cells.find((c) => unitLabels.includes(c));

    const lines = text.split("\n");
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(/^#(?!:)\s*(.+)$/);
      if (!m) continue;
      found = true;
      const title = stripWikiMarkup(m[1]!);
      if (INSTRUMENTAL.test(title)) continue;
      const next = lines[i + 1]?.match(/^#:\s*(.+)$/);
      tracks.push({ title, credits: next ? parseCredits(stripWikiMarkup(next[1]!)) : {}, unitLabel, release });
    }
    if (!found) {
      const creditText = cells.filter((c) => /作詞|作曲|編曲/.test(c)).join("\n");
      tracks.push({
        title: release.title,
        credits: parseCredits(stripWikiMarkup(creditText)),
        unitLabel,
        release,
      });
    }
  };

  for (const line of section.split("\n")) {
    const heading = line.match(/^={3,}\s*(.+?)\s*={3,}\s*$/);
    if (heading) {
      flushRow();
      kind = kindFromHeading(heading[1]!) ?? kind;
      continue;
    }
    if (/^\|-/.test(line) || /^\|\}/.test(line)) {
      flushRow();
      continue;
    }
    row.push(line);
  }
  flushRow();
  return tracks;
}
