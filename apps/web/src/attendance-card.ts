/*
 * 「参戦記録」のシェア画像（1200×675、X の 1 枚画像で切れない 16:9）をブラウザで描く。
 * 記録はブラウザにしか無いので、サーバーではなくここで作る。
 * 見た目はサイトの共有カード（OGP）に揃える。色・飾りはグループのテーマ（@lovely-memory/core の SHARE_THEMES）から。
 */
import {
  LACE_HEART_PATHS,
  SHARE_ICON_SHAPES,
  SHARE_THEMES,
  THEME_ICONS,
  type ArtistTheme,
  type MotifIcon,
  type ShareTheme,
} from "@lovely-memory/core/runtime";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

export type AttendanceCardData = {
  artistName: string;
  /** グループのテーマ（色・飾り） */
  theme: ArtistTheme;
  subtitle?: string;
  /** YYYY-MM-DD（いつ時点の記録か） */
  date: string;
  attended: number;
  held: number;
  heardSongs: number;
  sungSongs: number;
  performances: number;
  topSongs: Array<{ title: string; count: number }>;
  /** 最初に参戦したイベントの日（YYYY-MM-DD） */
  firstDate?: string;
  notHeard: number;
  host: string;
};

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif';
/**
 * カードに描く文字をすべて集める。見えないキャンバスに一度描いて、fillText・measureText に渡った文字列を記録する
 * （手で文字の一覧を持つと漏れが出て、その字だけ別のフォントで描かれてしまうため）
 */
export function cardChars(d: AttendanceCardData): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  let all = "…";
  const fillText = ctx.fillText.bind(ctx);
  const measureText = ctx.measureText.bind(ctx);
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    all += text;
    fillText(text, x, y, maxWidth);
  };
  ctx.measureText = (text: string) => {
    all += text;
    return measureText(text);
  };
  drawAttendanceCard(canvas, d);
  return [...new Set(all)].join("");
}

/** カードに使う文字だけを含む Web フォントを読み込む（失敗・オフラインならシステムのフォントで描く） */
export async function loadCardFont(chars: string): Promise<void> {
  const href = `https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=block&text=${encodeURIComponent(chars)}`;
  if (!document.querySelector(`link[data-card-font="${CSS.escape(href)}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.cardFont = href;
    document.head.append(link);
    await new Promise((resolve) => {
      link.onload = resolve;
      link.onerror = resolve;
      setTimeout(resolve, 3000);
    });
  }
  await Promise.race([
    Promise.all([document.fonts.load(`800 40px "M PLUS Rounded 1c"`, chars), document.fonts.load(`500 40px "M PLUS Rounded 1c"`, chars)]),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {});
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 幅に収まるよう末尾を「…」で切る */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > width) t = t.slice(0, -1);
  return t + "…";
}

/** 飾り（太陽・月・ハート・王冠）を描く。形は SHARE_ICON_SHAPES（16×16）、色はテーマから */
function icon(ctx: CanvasRenderingContext2D, name: MotifIcon, style: ShareTheme["icons"][number], x: number, y: number, size: number) {
  const { paths, rays } = SHARE_ICON_SHAPES[name];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 16, size / 16);
  ctx.fillStyle = ctx.strokeStyle = style.color;
  if (style.glow) {
    ctx.shadowColor = style.glow;
    ctx.shadowBlur = style.glowBlur ?? 0;
  }
  for (const d of paths) ctx.fill(new Path2D(d));
  if (rays) {
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    for (const [x1, y1, x2, y2] of rays) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 背景の飾り：星、または網点・斜めの光・ハート（OGP の .stars と同じ配置） */
function decorate(ctx: CanvasRenderingContext2D, t: ShareTheme, W: number, H: number) {
  if (t.decoration === "stars") {
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (const [x, y, r] of [
      [0.68, 0.05, 1.8],
      [0.81, 0.96, 2],
      [0.97, 0.4, 1.4],
      [0.63, 0.97, 1.4],
      [0.92, 0.04, 1.4],
    ] as const) {
      ctx.beginPath();
      ctx.arc(W * x, H * y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // 網点
  ctx.fillStyle = "rgba(255,255,255,.55)";
  for (let y = 7.5; y < H; y += 15)
    for (let x = 7.5; x < W; x += 15) {
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  // 左下から広がる斜めの光（4° の光と 6° のすき間を繰り返す）
  ctx.fillStyle = "rgba(255,255,255,.38)";
  for (let a = 0; a < 90; a += 10) {
    const from = ((a - 90) * Math.PI) / 180;
    const to = ((a + 4 - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.arc(0, H, W * 2, from, to);
    ctx.closePath();
    ctx.fill();
  }
  // ハート（OGP と同じ 280×168 の繰り返し）
  const heart = new Path2D(SHARE_ICON_SHAPES.heart.paths[0]);
  const k = 280 / 160;
  const hearts: Array<[number, number, number, number, number]> = [
    [18, 14, 0.75, -12, 0.85],
    [104, 8, 0.5, 14, 0.7],
    [130, 54, 0.9, 10, 0.9],
    [62, 60, 0.45, -8, 0.6],
  ];
  ctx.fillStyle = "#fff";
  for (let ty = 0; ty < H; ty += 168)
    for (let tx = 0; tx < W; tx += 280)
      for (const [x, y, s, r, op] of hearts) {
        ctx.save();
        ctx.globalAlpha = op;
        ctx.translate(tx + x * k, ty + y * k);
        ctx.scale(k * s * 1.5, k * s * 1.5);
        ctx.translate(8, 8);
        ctx.rotate((r * Math.PI) / 180);
        ctx.translate(-8, -8);
        ctx.fill(heart);
        ctx.restore();
      }
}

/** カードの右上のレースのハート */
function laceHeart(ctx: CanvasRenderingContext2D, color: string, right: number, top: number) {
  const w = 150;
  const h = 138;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.translate(right - w / 2, top + h / 2);
  ctx.rotate((8 * Math.PI) / 180);
  ctx.scale(w / 120, h / 110);
  ctx.translate(-60, -55);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  ctx.setLineDash([0, 9]);
  ctx.stroke(new Path2D(LACE_HEART_PATHS[0]));
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.stroke(new Path2D(LACE_HEART_PATHS[1]));
  ctx.restore();
}

/** 大見出し：グラデーションの文字、または縁取りの文字（縁の太さは 92px の見出しを基準に、大きさに合わせる） */
function heading(ctx: CanvasRenderingContext2D, t: ShareTheme, text: string, x: number, y: number, size: number) {
  const h = t.heading;
  if (h.kind === "gradient") {
    const tw = ctx.measureText(text).width;
    const g = ctx.createLinearGradient(x, 0, x + tw, 0);
    for (const [o, c] of h.stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillText(text, x, y);
    return;
  }
  const k = size / 92;
  const rings = [...h.rings].reverse();
  ctx.save();
  ctx.lineJoin = "round";
  const outer = rings[0]!;
  ctx.strokeStyle = ctx.fillStyle = h.drop[1];
  ctx.lineWidth = outer[0] * 2 * k;
  ctx.strokeText(text, x, y + h.drop[0] * k);
  ctx.fillText(text, x, y + h.drop[0] * k);
  for (const [r, c] of rings) {
    ctx.strokeStyle = c;
    ctx.lineWidth = r * 2 * k;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = h.fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawAttendanceCard(canvas: HTMLCanvasElement, d: AttendanceCardData): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;

  const t = SHARE_THEMES[d.theme];
  const [startIcon, endIcon] = THEME_ICONS[d.theme];

  // 背景（sun-moon なら朝の光 → 夕暮れ → 夜空）
  const bg = ctx.createLinearGradient(0, H * 0.2, W, H * 0.8);
  for (const [o, c] of t.background.stops) bg.addColorStop(o, c);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  decorate(ctx, t, W, H);

  // カード
  const cx = 48,
    cy = 40,
    cw = W - 96,
    ch = H - 40 - 96;
  ctx.save();
  ctx.shadowColor = t.cardShadow;
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "rgba(255,255,255,.95)";
  roundRect(ctx, cx, cy, cw, ch, 32);
  ctx.fill();
  ctx.restore();
  if (t.lace) laceHeart(ctx, t.lace, cx + cw - 34, cy + 26);

  const px = cx + 48;
  const inner = cw - 96;
  ctx.textBaseline = "alphabetic";

  // グループ名・日付
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = t.ink;
  ctx.fillText(d.artistName, px, cy + 70);
  if (d.subtitle) {
    const w = ctx.measureText(d.artistName).width;
    ctx.font = `500 20px ${FONT}`;
    ctx.fillStyle = t.inkSoft;
    ctx.fillText(d.subtitle, px + w + 10, cy + 70);
  }
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = "#7a7488";
  ctx.textAlign = "right";
  ctx.fillText(`${d.date.replaceAll("-", ".")} 時点`, px + inner, cy + 70);
  ctx.textAlign = "left";

  // 見出し「参戦記録」
  ctx.font = `800 76px ${FONT}`;
  heading(ctx, t, "参戦記録", px, cy + 160, 76);

  // 数字 3 つ
  const gap = 20;
  const bw = (inner - gap * 2) / 3;
  const by = cy + 196;
  const bh = 138;
  const boxes: Array<[string, string, string]> = [
    [String(d.attended), `/ ${d.held}`, "参戦したイベント"],
    [String(d.heardSongs), `/ ${d.sungSongs}`, "生で聴いた曲"],
    [String(d.performances), "曲", "聴いた歌唱（のべ）"],
  ];
  boxes.forEach(([value, unit, label], i) => {
    const bx = px + i * (bw + gap);
    // 背景の夜空が透けても見分けがつくよう、半透明の色を重ねる
    ctx.fillStyle = t.boxFill;
    roundRect(ctx, bx, by, bw, bh, 18);
    ctx.fill();
    ctx.font = `800 64px ${FONT}`;
    ctx.fillStyle = "#26222f";
    ctx.fillText(value, bx + 24, by + 78);
    const vw = ctx.measureText(value).width;
    ctx.font = `500 28px ${FONT}`;
    ctx.fillStyle = "#7a7488";
    ctx.fillText(unit, bx + 24 + vw + 10, by + 78);
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(label, bx + 24, by + 116);
  });

  // 下段：左によく聴いた曲（上位 3 曲）、右に初参戦の日とまだ聴いていない曲
  const ly = by + bh + 42;
  const split = px + inner * 0.62;
  ctx.font = `800 22px ${FONT}`;
  ctx.fillStyle = t.accent;
  ctx.fillText("よく聴いた曲", px, ly);
  d.topSongs.slice(0, 3).forEach((s, i) => {
    const y = ly + 40 + i * 38;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = "#b8b0c8";
    ctx.fillText(String(i + 1), px, y);
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = "#7a7488";
    ctx.textAlign = "right";
    const count = `${s.count}回`;
    ctx.fillText(count, split - 40, y);
    const cw = ctx.measureText(count).width;
    ctx.textAlign = "left";
    ctx.font = `500 26px ${FONT}`;
    ctx.fillStyle = "#26222f";
    ctx.fillText(fit(ctx, s.title, split - 40 - cw - 16 - (px + 30)), px + 30, y);
  });

  ctx.font = `800 22px ${FONT}`;
  ctx.fillStyle = t.accent;
  ctx.fillText("初参戦", split, ly);
  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = "#26222f";
  ctx.fillText(d.firstDate ? d.firstDate.replaceAll("-", ".") : "—", split, ly + 44);
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = "#5b5470";
  const note = d.sungSongs > 0 && d.notHeard === 0 ? "全曲を生で聴きました！" : `まだ生で聴いていない曲 ${d.notHeard} 曲`;
  ctx.fillText(fit(ctx, note, px + inner - split), split, ly + 94);

  // フッター
  const fy = H - 46;
  icon(ctx, startIcon, t.icons[0], 56, fy - 20, 36);
  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = t.footer.color;
  ctx.shadowColor = t.footer.shadow;
  ctx.shadowBlur = t.footer.shadowBlur;
  const brand = "ラブリィメモリー";
  if (t.footer.outline) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = t.footer.outline;
    ctx.strokeText(brand, 104, fy + 10);
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  ctx.fillText(brand, 104, fy + 10);
  const bwid = ctx.measureText(brand).width;
  ctx.shadowBlur = 0;
  icon(ctx, endIcon, t.icons[1], 104 + bwid + 12, fy - 18, 32);
  ctx.font = `500 24px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillStyle = t.footer.hostColor;
  ctx.fillText(d.host, W - 56, fy + 10);
  ctx.textAlign = "left";
}
