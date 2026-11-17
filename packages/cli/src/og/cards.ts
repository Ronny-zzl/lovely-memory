/*
 * 共有カード（OGP 画像, 1200×630）の HTML。Chrome でスクリーンショットして PNG にする。
 * 見た目はサイト全体の画像（tools/og/og.html）と揃える：左が朝の光、右が夜空。
 */
import {
  displayTitle,
  EVENT_TYPE_LABEL,
  formatDate,
  formatDayWithWeekday,
  formatPercent,
  type ArtistConfig,
  type EventSetlist,
  type ResolvedEvent,
  type SongPosition,
  type SongStats,
} from "@lovely-memory/core";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SUN = `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.4" fill="currentColor"/><g stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><line x1="8" y1="1" x2="8" y2="2.8"/><line x1="8" y1="13.2" x2="8" y2="15"/><line x1="1" y1="8" x2="2.8" y2="8"/><line x1="13.2" y1="8" x2="15" y2="8"/><line x1="3.05" y1="3.05" x2="4.3" y2="4.3"/><line x1="11.7" y1="11.7" x2="12.95" y2="12.95"/><line x1="3.05" y1="12.95" x2="4.3" y2="11.7"/><line x1="11.7" y1="4.3" x2="12.95" y2="3.05"/></g></svg>`;
const MOON = `<svg viewBox="0 0 16 16"><path d="M10.2 2.2A6 6 0 1 0 13.8 11 4.8 4.8 0 0 1 10.2 2.2Z" fill="currentColor"/></svg>`;

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body {
  position: relative;
  font-family: "M PLUS Rounded 1c", sans-serif;
  color: #26222f;
  background: linear-gradient(105deg, #fff5d6 0%, #ffdca6 24%, #f7ae78 42%, #b4688f 50%, #5a4589 58%, #2f2c6c 74%, #1b1f4d 100%);
}
.stars { position: absolute; inset: 0; opacity: .9; background:
  radial-gradient(circle at 68% 6%, #fff 0 1.6px, transparent 2.4px),
  radial-gradient(circle at 81% 95%, #fffbe6 0 1.8px, transparent 2.6px),
  radial-gradient(circle at 97% 40%, #fff 0 1.2px, transparent 2px),
  radial-gradient(circle at 63% 96%, #fffbe6 0 1.2px, transparent 2px),
  radial-gradient(circle at 92% 4%, #fff 0 1.2px, transparent 2px); }
.card {
  position: absolute; left: 48px; right: 48px; top: 40px; bottom: 92px;
  padding: 36px 48px 32px;
  border-radius: 32px;
  background: rgb(255 255 255 / .94);
  box-shadow: 0 18px 50px rgb(30 20 60 / .25);
  display: flex; flex-direction: column;
}
.footer {
  position: absolute; left: 0; right: 0; bottom: 22px; height: 50px;
  display: flex; align-items: center; justify-content: space-between; padding: 0 56px;
  font-weight: 800; color: #fff; text-shadow: 0 1px 6px rgb(30 20 60 / .45);
}
.footer .brand { display: flex; align-items: center; gap: 12px; font-size: 30px; }
.footer .brand svg { width: 36px; height: 36px; }
.footer .sun { color: #f39a1e; filter: drop-shadow(0 0 10px rgb(255 190 80 / .9)); }
.footer .moon { color: #ffe7a6; }
.footer .host { font-size: 24px; font-weight: 500; opacity: .9; }
.group { font-size: 24px; font-weight: 800; color: #4a3f7a; }
.group small { font-size: 19px; font-weight: 500; color: #8a7fa8; margin-left: 8px; }
.fit { overflow: hidden; }
.badges { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.badge { font-size: 22px; font-weight: 800; padding: 3px 14px; border-radius: 8px; background: #e8e6f3; color: #3d4b8f; }
.badge.era-2nd { background: #fde4cc; color: #9a4a0b; }
.badge.era-cover { background: #e3f1e6; color: #2f6b3d; }
.badge.role { background: #fbead8; color: #d4741c; }
.badge.type { background: #efedf5; color: #5b5470; }
.unit { display: inline-flex; align-items: center; gap: 6px; font-size: 22px; font-weight: 800; padding: 3px 16px 3px 10px; border-radius: 999px; }
.unit svg { width: 24px; height: 24px; }
.unit-sun { background: linear-gradient(120deg, #fff6d2, #ffe0a3); color: #8a4b06; border: 2px solid #f6cf86; }
.unit-sun svg { color: #f08a12; }
.unit-moon { background: linear-gradient(120deg, #23285a, #43397f); color: #f6efd2; border: 2px solid #23285a; }
.unit-moon svg { color: #ffe39a; }
.muted { color: #7a7488; }
/* 曲 */
.song-title { margin: 10px 0 14px; height: 120px; display: flex; align-items: center; font-size: 92px; font-weight: 800; line-height: 1.15; white-space: nowrap;
  background: linear-gradient(90deg, #e98a1f 0%, #d9658a 55%, #4b3f9a 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stats { margin-top: auto; display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 16px; }
.stat { padding: 14px 18px; border-radius: 16px; background: #f6f3fb; }
.stat .v { font-size: 46px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
.stat .v small { font-size: 24px; font-weight: 500; color: #7a7488; margin-left: 6px; }
.stat .v.date { font-size: 34px; padding: 6px 0 4px; }
.stat .l { font-size: 20px; font-weight: 500; color: #7a7488; margin-top: 2px; }
.note { margin-top: 10px; font-size: 22px; color: #5b5470; }
/* 公演 */
.ev-date { font-size: 26px; font-weight: 800; color: #4a3f7a; display: flex; gap: 14px; align-items: baseline; white-space: nowrap; overflow: hidden; }
.ev-date .venue { font-size: 22px; font-weight: 500; color: #7a7488; overflow: hidden; text-overflow: ellipsis; }
.ev-title { margin: 6px 0 10px; height: 92px; font-size: 40px; font-weight: 800; line-height: 1.15; display: flex; align-items: center; }
.ev-meta { display: flex; gap: 16px; align-items: center; }
.dots { display: flex; gap: 8px; }
.dots span { width: 22px; height: 22px; border-radius: 50%; }
.dots span.absent { opacity: .2; }
.setlist { margin-top: 16px; flex: 1; columns: var(--cols); column-gap: 28px; column-fill: auto; font-size: var(--fs); line-height: 1.45; list-style: none; overflow: hidden; }
.setlist li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; break-inside: avoid; }
.setlist .no { display: inline-block; width: 2.4em; color: #9a93ab; font-size: .8em; font-weight: 500; }
.setlist .debut { color: #d4741c; font-size: .7em; font-weight: 800; margin-left: 6px; }
.setlist .stage { font-weight: 800; color: #d4741c; font-size: .82em; }
.empty { margin-top: auto; margin-bottom: auto; font-size: 30px; color: #7a7488; text-align: center; }
.more { font-size: 20px; color: #7a7488; text-align: right; margin-top: 4px; }
`;

/** 収まるまで文字を小さくする（曲名・公演名の長さがまちまちなので） */
const FIT_SCRIPT = `
for (const el of document.querySelectorAll(".fit")) {
  let size = parseFloat(getComputedStyle(el).fontSize);
  const min = Number(el.dataset.min || 24);
  while (size > min && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
    size -= 2;
    el.style.fontSize = size + "px";
  }
}
`;

function page(body: string, host: string | undefined): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=block" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="stars"></div>
<div class="card">${body}</div>
<div class="footer"><span class="brand"><span class="sun">${SUN}</span>ラブリィメモリー<span class="moon">${MOON}</span></span>${host ? `<span class="host">${esc(host)}</span>` : ""}</div>
<script>window.__fit = () => { ${FIT_SCRIPT} };</script>
</body></html>`;
}

function groupLine(artist: ArtistConfig): string {
  return `<div class="group">${esc(artist.name)}${artist.subtitle ? `<small>${esc(artist.subtitle)}</small>` : ""}</div>`;
}

export function songCard(artist: ArtistConfig, s: SongStats, position: SongPosition | undefined, role: "opener" | "closer" | undefined, host?: string): string {
  const { song } = s;
  const era = artist.eras.find((e) => e.id === song.era && e.id !== artist.defaultEra);
  const unit = artist.units.find((u) => u.id === song.unit && u.id !== artist.defaultUnit);
  const badges = [
    era && `<span class="badge era-${esc(era.id)}">${esc(era.label)}</span>`,
    unit &&
      (unit.motif
        ? `<span class="unit unit-${unit.motif}">${unit.motif === "sun" ? SUN : MOON}${esc(unit.label)}</span>`
        : `<span class="badge">${esc(unit.label)}</span>`),
    role && `<span class="badge role">${role === "closer" ? "ラスト定番" : "1曲目定番"}</span>`,
  ].filter(Boolean);

  const stat = (v: string, l: string, cls = "") => `<div class="stat"><div class="v ${cls}">${v}</div><div class="l">${l}</div></div>`;
  let stats: string[];
  if (s.count === 0) {
    stats = [];
  } else if (song.cover) {
    // カバー曲は歌唱率を出さない（サイトと同じ）
    stats = [stat(`${s.count}<small>回</small>`, "歌唱回数"), stat(formatDate(s.first!.date), "初披露", "date"), stat(formatDate(s.last!.date), "最終", "date")];
  } else {
    stats = [
      stat(`${formatPercent(s.rate)}<small>${s.events}/${s.eligibleEvents}</small>`, "歌唱率（初披露以降）"),
      stat(`${s.count}<small>回</small>`, "歌唱回数"),
      stat(formatDate(s.first!.date), "初披露", "date"),
      stat(formatDate(s.last!.date), "最終", "date"),
    ];
  }
  const note = song.cover
    ? `<p class="note">カバー曲 ・ 原曲: ${esc(song.cover.artist)}${song.cover.title ? `「${esc(song.cover.title)}」` : ""}</p>`
    : position && position.count > 0 && !role
      ? `<p class="note muted">1 曲目 ${position.opener} 回 ・ ラスト ${position.closer} 回</p>`
      : "";

  return page(
    `${groupLine(artist)}
<div class="song-title fit" data-min="40">${esc(song.title)}</div>
<div class="badges">${badges.join("")}</div>
${note}
${s.count === 0 ? `<p class="empty">まだ歌われていません</p>` : `<div class="stats" style="--cols:${stats.length}">${stats.join("")}</div>`}`,
    host,
  );
}

export function eventCard(artist: ArtistConfig, event: ResolvedEvent, setlist: EventSetlist | undefined, host?: string): string {
  const types = event.types.map((t) => `<span class="badge type">${esc(EVENT_TYPE_LABEL[t])}</span>`).join("");
  const dots = artist.members
    .map((m) => `<span style="background:${esc(m.color ?? "#ccc")}"${event.members.includes(m.id) ? "" : ` class="absent"`}></span>`)
    .join("");

  // ステージが複数あるときはステージ名を見出しとして挟む
  const lines: string[] = [];
  let total = 0;
  // デビュー公演のように大半が初披露なら、1 曲ずつの「初披露」は付けない
  const entries = setlist?.stages.flatMap((st) => st.entries) ?? [];
  const markDebut = entries.filter((e) => e.debut).length * 2 <= entries.length;
  for (const st of setlist?.stages ?? []) {
    if ((setlist?.stages.length ?? 0) > 1 && st.name) lines.push(`<li class="stage">${esc(st.name)}${st.collab ? "（コラボ）" : ""}</li>`);
    for (const e of st.entries) {
      total++;
      lines.push(
        `<li><span class="no">${e.encore ? "EN" : `M${e.position}`}</span>${esc(e.song.title)}${e.debut && markDebut ? `<span class="debut">初披露</span>` : ""}</li>`,
      );
    }
  }
  const cols = lines.length > 14 ? 3 : 2;
  const rows = cols === 3 ? 8 : 7;
  const max = cols * rows;
  const shown = lines.length > max ? lines.slice(0, max - 1) : lines;
  const rest = lines.length - shown.length;

  const body = setlist
    ? `<ol class="setlist" style="--cols:${cols};--fs:${cols === 3 ? 22 : 27}px">${shown.join("")}</ol>${rest > 0 ? `<p class="more">ほか ${rest} 行</p>` : ""}`
    : `<p class="empty">${total === 0 ? "セトリは登録されていません" : ""}</p>`;

  return page(
    `<div class="ev-date">${event.date.slice(0, 4)}.${esc(formatDayWithWeekday(event.date))}${event.venue ? `<span class="venue">${esc(event.venue.name)}</span>` : ""}</div>
<div class="ev-title fit" data-min="26">${esc(displayTitle(event.title, artist.name))}</div>
<div class="ev-meta"><div class="badges">${types}</div><div class="dots">${dots}</div></div>
${body}`,
    host,
  );
}
