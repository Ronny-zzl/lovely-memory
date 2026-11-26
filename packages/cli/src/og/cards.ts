/*
 * 共有カード（OGP 画像, 1200×630）の HTML。Chrome でスクリーンショットして PNG にする。
 * 見た目はサイト全体の画像（tools/og/og.html）と揃える：左が朝の光、右が夜空。
 * 色・飾りはグループのテーマ（artist.json の theme）ごとに @lovely-memory/core の SHARE_THEMES から作る。
 */
import {
  creditParts,
  displayTitle,
  EVENT_TYPE_LABEL,
  formatDate,
  formatDayWithWeekday,
  formatPercent,
  isLightColor,
  membersOn,
  POSITION_ROLE_LABEL,
  tieupLabels,
  tieupText,
  milestoneText,
  type ArtistConfig,
  type EventSetlist,
  type Member,
  type Milestone,
  type ResolvedEvent,
  type SongPosition,
  type SongStats,
  LACE_HEART_PATHS,
  SHARE_ICON_SHAPES,
  SHARE_THEMES,
  THEME_ICONS,
  type ArtistTheme,
  type MotifIcon,
  type ShareTheme,
} from "@lovely-memory/core";

/** メンバーの色の点。白に近い色は白いカードの上で見えないので縁を付ける */
const dotCss = (color: string | undefined) =>
  `background:${esc(color ?? "#ccc")}${color && isLightColor(color) ? ";box-shadow:0 0 0 2px rgb(0 0 0 / .3)" : ""}`;

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 飾り（太陽・月・ハート・王冠）の SVG。形は @lovely-memory/core の SHARE_ICON_SHAPES */
function iconSvg(name: MotifIcon): string {
  const { paths, rays } = SHARE_ICON_SHAPES[name];
  const lines = rays
    ? `<g stroke="currentColor" stroke-width="1.1" stroke-linecap="round">${rays.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join("")}</g>`
    : "";
  return `<svg viewBox="0 0 16 16">${paths.map((d) => `<path d="${d}" fill="currentColor"/>`).join("")}${lines}</svg>`;
}

/** 文字の縁取り（text-shadow を円周に並べる）。内側から順に [太さ, 色] */
function outline(rings: Array<[number, string]>, drop: string): string {
  const parts = rings.flatMap(([r, color]) => {
    const n = Math.max(8, Math.round(r * 4));
    return Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return `${(r * Math.cos(a)).toFixed(2)}px ${(r * Math.sin(a)).toFixed(2)}px 0 ${color}`;
    });
  });
  return [...parts, drop].join(",");
}

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** 散らしたハート（背景に敷き詰める 1 枚分） */
const heartsTile = (color: string, opacities: number[]) =>
  svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='96' viewBox='0 0 160 96'><g fill='${color}'>${[
      [18, 14, 0.75, -12],
      [104, 8, 0.5, 14],
      [130, 54, 0.9, 10],
      [62, 60, 0.45, -8],
    ]
      .map(
        ([x, y, k, r], i) =>
          `<path opacity='${opacities[i]}' transform='translate(${x} ${y}) scale(${k! * 1.5}) rotate(${r} 8 8)' d='${SHARE_ICON_SHAPES.heart.paths[0]}'/>`,
      )
      .join("")}</g></svg>`,
  );

/** レースのハート（ロゴの意匠） */
const laceHeart = (color: string) =>
  svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 110'><g fill='none' stroke='${color}' stroke-linecap='round'><path stroke-width='6' stroke-dasharray='0 9' d='${LACE_HEART_PATHS[0]}'/><path stroke-width='2' d='${LACE_HEART_PATHS[1]}'/></g></svg>`,
  );

const stopsCss = (stops: Array<[number, string]>) => stops.map(([o, c]) => `${c} ${Math.round(o * 100)}%`).join(", ");

/** テーマ（@lovely-memory/core の SHARE_THEMES）の色・飾りの CSS */
function themeCss(t: ShareTheme): string {
  const bg = `linear-gradient(${t.background.angle}deg, ${stopsCss(t.background.stops)})`;
  const deco =
    t.decoration === "stars"
      ? `body { background: ${bg}; }
.stars { opacity: .9; background:
  radial-gradient(circle at 68% 6%, #fff 0 1.6px, transparent 2.4px),
  radial-gradient(circle at 81% 95%, #fffbe6 0 1.8px, transparent 2.6px),
  radial-gradient(circle at 97% 40%, #fff 0 1.2px, transparent 2px),
  radial-gradient(circle at 63% 96%, #fffbe6 0 1.2px, transparent 2px),
  radial-gradient(circle at 92% 4%, #fff 0 1.2px, transparent 2px); }`
      : `body { background:
  radial-gradient(circle, rgb(255 255 255 / .55) 0 1.8px, transparent 2.4px) 0 0 / 15px 15px,
  ${bg}; }
.stars { opacity: 1; background:
  repeating-conic-gradient(from 0deg at 0% 100%, rgb(255 255 255 / .38) 0 4deg, transparent 4deg 10deg),
  ${heartsTile("#fff", [0.85, 0.7, 0.9, 0.6])} 0 0 / 280px 168px; }`;
  const h = t.heading;
  const heading =
    h.kind === "gradient"
      ? `.song-title { background: linear-gradient(90deg, ${stopsCss(h.stops)}); -webkit-background-clip: text; background-clip: text; color: transparent; }`
      : `.song-title { color: ${h.fill}; padding-left: 10px; text-shadow: ${outline(h.rings, `0 ${h.drop[0]}px 0 ${h.drop[1]}`)}; }`;
  const icon = (i: ShareTheme["icons"][number]) =>
    `color: ${i.color};${i.glow ? ` filter: drop-shadow(0 0 ${i.glowBlur ?? 0}px ${i.glow});` : ""}`;
  const f = t.footer;
  const footerShadow = `0 ${f.shadowY}px ${f.shadowBlur}px ${f.shadow}`;
  return `
${deco}
.card { box-shadow: 0 18px 50px ${t.cardShadow};${t.lace ? " z-index: 0;" : ""} }
${
  t.lace
    ? `.card::after { content: ""; position: absolute; top: 26px; right: 34px; width: 150px; height: 138px; transform: rotate(8deg); z-index: -1;
  background: ${laceHeart(t.lace)} center / contain no-repeat; opacity: .5; pointer-events: none; }`
    : ""
}
.footer { color: ${f.color}; text-shadow: ${f.outline ? outline([[2, f.outline]], footerShadow) : footerShadow}; }
.footer .motif-start { ${icon(t.icons[0])} }
.footer .motif-end { ${icon(t.icons[1])} }
.group, .ev-date, .credit b { color: ${t.ink}; }
.group small { color: ${t.inkSoft}; }
${heading}
.setlist .debut, .setlist .stage { color: ${t.accent}; }
`;
}

/** テーマごとに、共通の色（themeCss）のほかに変えるところ */
const THEME_EXTRA_CSS: Partial<Record<ArtistTheme, string>> = {
  hearts: `
body { color: #22263f; }
.stat { background: #f7f2fa; }
.badge.role, .badge.ms { background: #fde4ef; color: #b8245f; }
.badge.tieup { background: #e0f1fb; color: #1a5f8a; }
.setlist .ms { color: #1a5f8a; }
`,
};

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body {
  position: relative;
  font-family: "M PLUS Rounded 1c", sans-serif;
  color: #26222f;
}
.stars { position: absolute; inset: 0; }
.card {
  position: absolute; left: 48px; right: 48px; top: 40px; bottom: 92px;
  padding: 36px 48px 32px;
  border-radius: 32px;
  background: rgb(255 255 255 / .94);
  display: flex; flex-direction: column;
}
.footer {
  position: absolute; left: 0; right: 0; bottom: 22px; height: 50px;
  display: flex; align-items: center; justify-content: space-between; padding: 0 56px;
  font-weight: 800;
}
.footer .brand { display: flex; align-items: center; gap: 12px; font-size: 30px; }
.footer .brand svg { width: 36px; height: 36px; }
.footer .host { font-size: 24px; font-weight: 500; opacity: .9; }
.group { flex-shrink: 0; font-size: 24px; font-weight: 800; }
.group small { font-size: 19px; font-weight: 500; margin-left: 8px; }
.fit { overflow: hidden; }
.badges { flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.badge { font-size: 22px; font-weight: 800; padding: 3px 14px; border-radius: 8px; background: #e8e6f3; color: #3d4b8f; }
.badge.era-2nd { background: #fde4cc; color: #9a4a0b; }
.badge.era-cover { background: #e3f1e6; color: #2f6b3d; }
.badge.role { background: #fbead8; color: #d4741c; }
.badge.tieup { background: #fde3ee; color: #b0306a; }
.badge.type { background: #efedf5; color: #5b5470; }
.unit { display: inline-flex; align-items: center; gap: 6px; font-size: 22px; font-weight: 800; padding: 3px 16px 3px 10px; border-radius: 999px; }
.unit svg { width: 24px; height: 24px; }
.unit-sun { background: linear-gradient(120deg, #fff6d2, #ffe0a3); color: #8a4b06; border: 2px solid #f6cf86; }
.unit-sun svg { color: #f08a12; }
.unit-moon { background: linear-gradient(120deg, #23285a, #43397f); color: #f6efd2; border: 2px solid #23285a; }
.unit-moon svg { color: #ffe39a; }
.muted { color: #7a7488; }
/* 曲 */
.song-title { flex-shrink: 0; margin: 6px 0 8px; height: 108px; display: flex; align-items: center; font-size: 92px; font-weight: 800; line-height: 1.15; white-space: nowrap; }
/* 作詞・作曲・編曲。長いもの（作曲者が 5 人など）は 2 行まで折り返し、それでも入らなければ .fit で小さくし、最後は … で切る */
.credit { flex-shrink: 0; margin: 0 0 12px; font-size: 24px; line-height: 1.35; max-height: 2.7em; overflow: hidden; color: #7a7488;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.credit .cr { margin-right: 1.1em; }
.credit .cr:last-child { margin-right: 0; }
.credit b { font-weight: 800; }
.stats { flex-shrink: 0; margin-top: auto; display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 16px; }
.stat { padding: 14px 18px; border-radius: 16px; background: #f6f3fb; }
.stat .v { font-size: 46px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
.stat .v small { font-size: 24px; font-weight: 500; color: #7a7488; margin-left: 6px; }
.stat .v.date { font-size: 34px; padding: 6px 0 4px; }
.stat .l { font-size: 20px; font-weight: 500; color: #7a7488; margin-top: 2px; }
.note { flex-shrink: 0; margin-top: 10px; font-size: 22px; color: #5b5470; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note span + span { margin-left: 1.2em; }
/* イベント */
.ev-date { font-size: 26px; font-weight: 800; display: flex; gap: 14px; align-items: baseline; white-space: nowrap; overflow: hidden; }
.ev-date .venue { font-size: 22px; font-weight: 500; color: #7a7488; overflow: hidden; text-overflow: ellipsis; }
.ev-title { margin: 6px 0 10px; height: 92px; font-size: 40px; font-weight: 800; line-height: 1.15; display: flex; align-items: center; }
.ev-meta { display: flex; gap: 16px; align-items: center; }
.dots { display: flex; gap: 8px; }
.dots span { width: 22px; height: 22px; border-radius: 50%; }
.dots span.absent { opacity: .2; }
.setlist { margin-top: 16px; flex: 1; columns: var(--cols); column-gap: 28px; column-fill: auto; font-size: var(--fs); line-height: 1.45; list-style: none; overflow: hidden; }
.setlist li { display: flex; align-items: baseline; white-space: nowrap; break-inside: avoid; }
.setlist .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.setlist .mdots { display: inline-flex; gap: 4px; margin-left: 8px; flex-shrink: 0; align-self: center; }
.setlist .mdots span { width: .5em; height: .5em; border-radius: 50%; }
.setlist .no { flex-shrink: 0; width: 2.4em; color: #9a93ab; font-size: .8em; font-weight: 500; }
.setlist .debut { flex-shrink: 0; font-size: .7em; font-weight: 800; margin-left: 6px; }
.setlist .stage { font-weight: 800; font-size: .82em; }
.setlist .ms { flex-shrink: 0; color: #b0306a; font-size: .7em; font-weight: 800; margin-left: 6px; }
.ev-meta { flex-wrap: wrap; row-gap: 8px; }
.badge.ms { background: #fde4cc; color: #9a4a0b; }
.badge.bday { display: inline-flex; align-items: center; gap: 8px; background: #fde3ee; color: #b0306a; }
.badge.bday i { width: 16px; height: 16px; border-radius: 50%; }
.empty { margin-top: auto; margin-bottom: auto; font-size: 30px; color: #7a7488; text-align: center; }
.more { font-size: 20px; color: #7a7488; text-align: right; margin-top: 4px; }
`;

/** 収まるまで文字を小さくする（曲名・イベント名の長さがまちまちなので） */
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

function page(artist: ArtistConfig, body: string, host: string | undefined): string {
  const theme = SHARE_THEMES[artist.theme];
  const [start, end] = THEME_ICONS[artist.theme];
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=block" rel="stylesheet">
<style>${CSS}${themeCss(theme)}${THEME_EXTRA_CSS[artist.theme] ?? ""}</style></head><body>
<div class="stars"></div>
<div class="card">${body}</div>
<div class="footer"><span class="brand"><span class="motif-start">${iconSvg(start)}</span>ラブリィメモリー<span class="motif-end">${iconSvg(end)}</span></span>${host ? `<span class="host">${esc(host)}</span>` : ""}</div>
<script>window.__fit = () => { ${FIT_SCRIPT} };</script>
</body></html>`;
}

function groupLine(artist: ArtistConfig): string {
  return `<div class="group">${esc(artist.name)}${artist.subtitle ? `<small>${esc(artist.subtitle)}</small>` : ""}</div>`;
}

export function songCard(
  artist: ArtistConfig,
  s: SongStats,
  position: SongPosition | undefined,
  role: "opener" | "closer" | undefined,
  host?: string,
): string {
  const { song } = s;
  const era = artist.eras.find((e) => e.id === song.era && e.id !== artist.defaultEra);
  const unit = artist.units.find((u) => u.id === song.unit && u.id !== artist.defaultUnit);
  const badges = [
    era && `<span class="badge era-${esc(era.id)}">${esc(era.label)}</span>`,
    unit &&
      (unit.motif
        ? `<span class="unit unit-${unit.motif}">${iconSvg(unit.motif)}${esc(unit.label)}</span>`
        : `<span class="badge">${esc(unit.label)}</span>`),
    ...tieupLabels(song.tieups).map((l) => `<span class="badge tieup">${esc(l)}</span>`),
    role && `<span class="badge role">${POSITION_ROLE_LABEL[role]}</span>`,
  ].filter(Boolean);

  const stat = (v: string, l: string, cls = "") => `<div class="stat"><div class="v ${cls}">${v}</div><div class="l">${l}</div></div>`;
  let stats: string[];
  if (s.count === 0) {
    stats = [];
  } else if (song.cover) {
    // カバー曲は歌唱率を出さない（サイトと同じ）
    stats = [
      stat(`${s.count}<small>回</small>`, "歌唱回数"),
      stat(formatDate(s.first!.date), "初披露", "date"),
      stat(formatDate(s.last!.date), "最終", "date"),
    ];
  } else {
    stats = [
      stat(`${formatPercent(s.rate)}<small>${s.events}/${s.eligibleEvents}</small>`, "歌唱率（初披露以降）"),
      stat(`${s.count}<small>回</small>`, "歌唱回数"),
      stat(formatDate(s.first!.date), "初披露", "date"),
      stat(formatDate(s.last!.date), "最終", "date"),
    ];
  }
  // タイアップと、カバーの原曲または曲順での位置を 1 行にまとめる（作詞・作曲・編曲の行の分の高さを空けるため）
  const notes = [
    ...song.tieups.map((t) => `<span>${esc(tieupText(t))}</span>`),
    song.cover
      ? `<span>カバー曲 ・ 原曲: ${esc(song.cover.artist)}${song.cover.title ? `「${esc(song.cover.title)}」` : ""}</span>`
      : position && position.count > 0
        ? // 「ラスト定番」などのバッジがあっても回数は出す（サイトの「セトリでの位置」と同じ）
          `<span class="muted">1 曲目 ${position.opener} 回 ・ ラスト ${position.closer} 回${position.encore > 0 ? ` ・ アンコール ${position.encore} 回` : ""}</span>`
        : "",
  ].filter(Boolean);
  const note = notes.length ? `<p class="note fit" data-min="16">${notes.join("")}</p>` : "";

  const credits = creditParts(song.credits)
    .map((p) => `<span class="cr">${esc(p.roles)}：<b>${esc(p.name)}</b></span>`)
    .join(" ");
  return page(
    artist,
    `${groupLine(artist)}
<div class="song-title fit" data-min="40">${esc(song.title)}</div>
${credits ? `<p class="credit fit" data-min="18">${credits}</p>` : ""}
<div class="badges">${badges.join("")}</div>
${note}
${s.count === 0 ? `<p class="empty">まだ歌われていません</p>` : `<div class="stats" style="--cols:${stats.length}">${stats.join("")}</div>`}`,
    host,
  );
}

/** 曲の節目を、セトリの行に添える短い表記で */
function songMilestoneShort(m: Milestone): string | undefined {
  switch (m.kind) {
    case "song-count":
      return `通算${m.count}回目`;
    case "song-streak":
      return `${m.streak}回連続`;
    case "song-return":
      return `${m.gap}回ぶり`;
    default:
      return undefined;
  }
}

/** イベントカードに添える記録（サイトの「このイベントの記録」と同じもの） */
export type EventHighlights = {
  /** このイベントで達成した節目 */
  milestones: Milestone[];
  /** この日が誕生日のメンバーと、迎えた年齢 */
  birthdays: Array<{ member: Member; age: number }>;
};

export function eventCard(
  artist: ArtistConfig,
  event: ResolvedEvent,
  setlist: EventSetlist | undefined,
  host?: string,
  highlights: EventHighlights = { milestones: [], birthdays: [] },
): string {
  // イベント全体の節目（通算 N 回目のイベントなど）と誕生日は、種別の隣にバッジで
  const eventBadges = [
    ...highlights.birthdays.map(
      (b) => `<span class="badge bday"><i style="${dotCss(b.member.color)}"></i>${esc(b.member.name)} ${b.age}歳の誕生日</span>`,
    ),
    ...highlights.milestones.filter((m) => !("song" in m)).map((m) => `<span class="badge ms">${esc(milestoneText(m))}</span>`),
  ];
  // 曲の節目は、その曲の行に（同じ曲が 2 回あれば最初の行に）
  const songMarks = new Map<string, string[]>();
  for (const m of highlights.milestones) {
    const text = "song" in m ? songMilestoneShort(m) : undefined;
    if ("song" in m && text) songMarks.set(m.song.id, [...(songMarks.get(m.song.id) ?? []), text]);
  }
  const types = event.types.map((t) => `<span class="badge type">${esc(EVENT_TYPE_LABEL[t])}</span>`).join("") + eventBadges.join("");
  // その日に在籍していたメンバーだけ（加入前・卒業や休止の後は出さない）
  // 出演するメンバーが初めから一部だけのイベントなら、出演した人だけ
  const dots = membersOn(artist.members, event.date)
    .filter((m) => !event.partialLineup || event.members.includes(m.id))
    .map((m) => `<span style="${dotCss(m.color)}"${event.members.includes(m.id) ? "" : ` class="absent"`}></span>`)
    .join("");

  // ステージが複数あるときはステージ名を見出しとして挟む
  const lines: string[] = [];
  let total = 0;
  // デビューイベントのように大半が初披露なら、1 曲ずつの「初披露」は付けない
  const entries = setlist?.stages.flatMap((st) => st.entries) ?? [];
  const markDebut = entries.filter((e) => e.debut).length * 2 <= entries.length;
  for (const st of setlist?.stages ?? []) {
    if ((setlist?.stages.length ?? 0) > 1 && st.name) lines.push(`<li class="stage">${esc(st.name)}${st.collab ? "（コラボ）" : ""}</li>`);
    for (const e of st.entries) {
      total++;
      // イベントの出演メンバーと違う曲（ユニット曲・カバー・コラボなど）は、歌ったメンバーの色を付ける（サイトと同じ条件）
      const partial = e.members.length !== event.members.length || e.members.some((m) => !event.members.includes(m));
      const mdots = partial
        ? `<span class="mdots">${artist.members
            .filter((m) => e.members.includes(m.id))
            .map((m) => `<span style="${dotCss(m.color)}"></span>`)
            .join("")}</span>`
        : "";
      const marks = songMarks.get(e.song.id);
      songMarks.delete(e.song.id);
      const ms = marks ? `<span class="ms">${esc(marks.join("・"))}</span>` : "";
      lines.push(
        `<li><span class="no">${e.no}</span><span class="t">${esc(e.song.title)}</span>${mdots}${e.debut && markDebut ? `<span class="debut">初披露</span>` : ""}${ms}</li>`,
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
    artist,
    `<div class="ev-date">${event.date.slice(0, 4)}.${esc(formatDayWithWeekday(event.date))}${event.venue ? `<span class="venue">${esc(event.venue.name)}</span>` : ""}</div>
<div class="ev-title fit" data-min="26">${esc(displayTitle(event.title, artist.name))}</div>
<div class="ev-meta"><div class="badges">${types}</div><div class="dots">${dots}</div></div>
${body}`,
    host,
  );
}
