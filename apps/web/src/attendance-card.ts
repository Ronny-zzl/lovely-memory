/*
 * 「参戦記録」のシェア画像（1200×675、X の 1 枚画像で切れない 16:9）をブラウザで描く。
 * 記録はブラウザにしか無いので、サーバーではなくここで作る。
 * 見た目はサイトの共有カード（左が朝の光、右が夜空）に揃える。
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

export type AttendanceCardData = {
  artistName: string;
  subtitle?: string;
  /** YYYY-MM-DD（いつ時点の記録か） */
  date: string;
  attended: number;
  held: number;
  heardSongs: number;
  sungSongs: number;
  performances: number;
  topSongs: Array<{ title: string; count: number }>;
  /** 最初に参戦した公演の日（YYYY-MM-DD） */
  firstDate?: string;
  notHeard: number;
  host: string;
};

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif';
const SUN = "M8 4.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8Z";
const SUN_RAYS: Array<[number, number, number, number]> = [
  [8, 1, 8, 2.8], [8, 13.2, 8, 15], [1, 8, 2.8, 8], [13.2, 8, 15, 8],
  [3.05, 3.05, 4.3, 4.3], [11.7, 11.7, 12.95, 12.95], [3.05, 12.95, 4.3, 11.7], [11.7, 4.3, 12.95, 3.05],
];
const MOON = "M10.2 2.2A6 6 0 1 0 13.8 11 4.8 4.8 0 0 1 10.2 2.2Z";

/** カードに使う文字だけを含む Web フォントを読み込む（失敗・オフラインならシステムのフォントで描く） */
export async function loadCardFont(text: string): Promise<void> {
  const chars = [...new Set(text + "0123456789/%・回曲公演参戦記録時点ラブリィメモリー")].join("");
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

function icon(ctx: CanvasRenderingContext2D, kind: "sun" | "moon", x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 16, size / 16);
  if (kind === "sun") {
    ctx.fillStyle = ctx.strokeStyle = "#f39a1e";
    ctx.shadowColor = "rgba(255,190,80,.9)";
    ctx.shadowBlur = 10;
    ctx.fill(new Path2D(SUN));
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    for (const [x1, y1, x2, y2] of SUN_RAYS) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#ffe7a6";
    ctx.fill(new Path2D(MOON));
  }
  ctx.restore();
}

export function drawAttendanceCard(canvas: HTMLCanvasElement, d: AttendanceCardData): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;

  // 背景：朝の光 → 夕暮れ → 夜空
  const bg = ctx.createLinearGradient(0, H * 0.2, W, H * 0.8);
  for (const [o, c] of [[0, "#fff5d6"], [0.24, "#ffdca6"], [0.42, "#f7ae78"], [0.5, "#b4688f"], [0.58, "#5a4589"], [0.74, "#2f2c6c"], [1, "#1b1f4d"]] as const) {
    bg.addColorStop(o, c);
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  for (const [x, y, r] of [[0.68, 0.05, 1.8], [0.81, 0.96, 2], [0.97, 0.4, 1.4], [0.63, 0.97, 1.4], [0.92, 0.04, 1.4]] as const) {
    ctx.beginPath();
    ctx.arc(W * x, H * y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // カード
  const cx = 48, cy = 40, cw = W - 96, ch = H - 40 - 96;
  ctx.save();
  ctx.shadowColor = "rgba(30,20,60,.25)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "rgba(255,255,255,.95)";
  roundRect(ctx, cx, cy, cw, ch, 32);
  ctx.fill();
  ctx.restore();

  const px = cx + 48;
  const inner = cw - 96;
  ctx.textBaseline = "alphabetic";

  // グループ名・日付
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = "#4a3f7a";
  ctx.fillText(d.artistName, px, cy + 70);
  if (d.subtitle) {
    const w = ctx.measureText(d.artistName).width;
    ctx.font = `500 20px ${FONT}`;
    ctx.fillStyle = "#8a7fa8";
    ctx.fillText(d.subtitle, px + w + 10, cy + 70);
  }
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = "#7a7488";
  ctx.textAlign = "right";
  ctx.fillText(`${d.date.replaceAll("-", ".")} 時点`, px + inner, cy + 70);
  ctx.textAlign = "left";

  // 見出し「参戦記録」
  ctx.font = `800 76px ${FONT}`;
  const title = "参戦記録";
  const tw = ctx.measureText(title).width;
  const tg = ctx.createLinearGradient(px, 0, px + tw, 0);
  tg.addColorStop(0, "#e98a1f");
  tg.addColorStop(0.55, "#d9658a");
  tg.addColorStop(1, "#4b3f9a");
  ctx.fillStyle = tg;
  ctx.fillText(title, px, cy + 160);

  // 数字 3 つ
  const gap = 20;
  const bw = (inner - gap * 2) / 3;
  const by = cy + 196;
  const bh = 138;
  const boxes: Array<[string, string, string]> = [
    [String(d.attended), `/ ${d.held}`, "参戦した公演"],
    [String(d.heardSongs), `/ ${d.sungSongs}`, "生で聴いた曲"],
    [String(d.performances), "曲", "聴いた歌唱（のべ）"],
  ];
  boxes.forEach(([value, unit, label], i) => {
    const bx = px + i * (bw + gap);
    // 背景の夜空が透けても見分けがつくよう、半透明の色を重ねる
    ctx.fillStyle = "rgba(90, 69, 137, 0.08)";
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
  ctx.fillStyle = "#d4741c";
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
  ctx.fillStyle = "#d4741c";
  ctx.fillText("初参戦", split, ly);
  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = "#26222f";
  ctx.fillText(d.firstDate ? d.firstDate.replaceAll("-", ".") : "—", split, ly + 44);
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = "#5b5470";
  const note =
    d.sungSongs > 0 && d.notHeard === 0 ? "全曲を生で聴きました！" : `まだ生で聴いていない曲 ${d.notHeard} 曲`;
  ctx.fillText(fit(ctx, note, px + inner - split), split, ly + 94);

  // フッター
  const fy = H - 46;
  icon(ctx, "sun", 56, fy - 20, 36);
  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(30,20,60,.45)";
  ctx.shadowBlur = 6;
  const brand = "ラブリィメモリー";
  ctx.fillText(brand, 104, fy + 10);
  const bwid = ctx.measureText(brand).width;
  ctx.shadowBlur = 0;
  icon(ctx, "moon", 104 + bwid + 12, fy - 18, 32);
  ctx.font = `500 24px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.fillText(d.host, W - 56, fy + 10);
  ctx.textAlign = "left";
}
