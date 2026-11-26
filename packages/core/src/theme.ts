/*
 * グループの見た目（artist.json の theme）。
 * - サイト：apps/web/src/styles/themes.css が [data-artist-theme] で tokens の変数を上書きする（色はそちらに書く）
 * - 共有画像（OGP カード：packages/cli/src/og/cards.ts、参戦記録の画像：apps/web/src/attendance-card.ts）：
 *   ここの SHARE_THEMES の色・飾りを使う。サイトの見た目を変えたら、ここもそろえる
 * ブラウザでも使うので zod は使わない。
 */

export const ARTIST_THEMES = ["sun-moon", "hearts", "rainbow"] as const;
/**
 * - sun-moon：太陽と月（左が朝の光、右が夜空）。太陽と踊れ月夜に唄え
 * - hearts：空色とピンクの網点にハート、紺の文字にピンクの縁取り。Mi'Line Hearts のロゴ・告知画像から
 * - rainbow：淡い虹色（ピンク→黄→若草→空色→薄紫）に桜の花びら、メンバーカラー 5 色の輪、ピンクの縁取りの白い文字
 */
export type ArtistTheme = (typeof ARTIST_THEMES)[number];
export const DEFAULT_THEME: ArtistTheme = "sun-moon";

/** ロゴ「ラブリィメモリー」の両脇などに置く飾り */
export type MotifIcon = "sun" | "moon" | "heart" | "crown" | "flower";

/** テーマごとの飾り：[先頭（1 曲目・ロゴの左）, 末尾（ラスト・ロゴの右）] */
export const THEME_ICONS: Record<ArtistTheme, [MotifIcon, MotifIcon]> = {
  "sun-moon": ["sun", "moon"],
  hearts: ["heart", "crown"],
  rainbow: ["flower", "flower"],
};

/** 桜の花びら 1 枚（中心 (cx, cy) から angle の向きに長さ r。先に切れ込み）の path */
function petalPath(cx: number, cy: number, r: number, angle: number): string {
  // 上向き（-y）の花びらを、中心のまわりに回す
  const pts: Array<[number, number]> = [
    [-0.46 * r, -0.29 * r],
    [-0.43 * r, -0.8 * r],
    [-0.23 * r, -0.94 * r],
    [0, -0.8 * r],
    [0.23 * r, -0.94 * r],
    [0.43 * r, -0.8 * r],
    [0.46 * r, -0.29 * r],
  ];
  const a = (angle * Math.PI) / 180;
  const [s, c] = [Math.sin(a), Math.cos(a)];
  const p = ([x, y]: [number, number]) => `${(cx + x * c - y * s).toFixed(2)} ${(cy + x * s + y * c).toFixed(2)}`;
  const [c1, c2, l1, n, r1, c3, c4] = pts.map(p);
  return `M${cx} ${cy}C${c1} ${c2} ${l1}L${n}L${r1}C${c3} ${c4} ${cx} ${cy}Z`;
}
/** 散らす花びら 1 枚（16×16） */
export const PETAL_PATH = petalPath(8, 15, 14, 0);
/** 背景に散らす花びらの並び（160×96 の 1 枚分）：[x, y, 大きさ, 回転, 不透明度]。サイト（themes.css）と共有画像で同じ */
export const PETALS: Array<[number, number, number, number, number]> = [
  [14, 10, 0.9, -25, 0.9],
  [92, 6, 0.6, 40, 0.75],
  [128, 46, 1, 15, 0.9],
  [58, 58, 0.55, -60, 0.7],
  [20, 70, 0.7, 70, 0.8],
];

/**
 * 共有画像に描く飾りの形（16×16）。塗りつぶす path と、線（太陽の光）
 * サイトのアイコン（apps/web/src/components/Icons.tsx）は小さく表示する用に少し形が違う
 */
export const SHARE_ICON_SHAPES: Record<MotifIcon, { paths: string[]; rays?: Array<[number, number, number, number]> }> = {
  sun: {
    paths: ["M8 4.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8Z"],
    rays: [
      [8, 1, 8, 2.8],
      [8, 13.2, 8, 15],
      [1, 8, 2.8, 8],
      [13.2, 8, 15, 8],
      [3.05, 3.05, 4.3, 4.3],
      [11.7, 11.7, 12.95, 12.95],
      [3.05, 12.95, 4.3, 11.7],
      [11.7, 4.3, 12.95, 3.05],
    ],
  },
  moon: { paths: ["M10.2 2.2A6 6 0 1 0 13.8 11 4.8 4.8 0 0 1 10.2 2.2Z"] },
  heart: { paths: ["M8 14s-5.2-3.2-6.4-6.4A3.4 3.4 0 0 1 8 4.4a3.4 3.4 0 0 1 6.4 3.2C13.2 10.8 8 14 8 14Z"] },
  crown: {
    paths: ["M2 5.2l3.2 2.6L8 3.4l2.8 4.4L14 5.2l-1.3 6.6H3.3Z", "M4.1 12.6h7.8a.8.8 0 0 1 0 1.6H4.1a.8.8 0 0 1 0-1.6Z"],
  },
  // 桜（花びら 5 枚）
  flower: { paths: [0, 72, 144, 216, 288].map((deg) => petalPath(8, 8.4, 7.4, deg)) },
};

/** レースのハート（120×110、ロゴの意匠）：[点線の外周, 内側の線] */
export const LACE_HEART_PATHS: [string, string] = [
  "M60 100S10 68 10 36A24 24 0 0 1 60 22a24 24 0 0 1 50 14c0 32-50 64-50 64z",
  "M60 92S18 64 18 37A17 17 0 0 1 60 27a17 17 0 0 1 42 10c0 27-42 55-42 55z",
];

/** 大見出し（曲名・「参戦記録」）：グラデーションの文字、または縁取りの文字 */
export type ShareHeading =
  | { kind: "gradient"; stops: Array<[number, string]> }
  | {
      kind: "outline";
      fill: string;
      /** 内側から順に [太さ px（見出しの大きさ 92px のとき）, 色] */
      rings: Array<[number, string]>;
      /** 下にずらした影 [ずらす px, 色] */
      drop: [number, string];
    };

export type ShareTheme = {
  /** 背景のグラデーション（CSS の角度と、位置 0〜1 と色） */
  background: { angle: number; stops: Array<[number, string]> };
  /** 背景の飾り：星（sun-moon）、網点・斜めの光・ハート（hearts）、桜の花びら（rainbow） */
  decoration: "stars" | "hearts" | "petals";
  /** 白いカードの影の色 */
  cardShadow: string;
  heading: ShareHeading;
  /** グループ名・日付などの濃い文字 */
  ink: string;
  /** サブタイトルなどの薄い文字 */
  inkSoft: string;
  /** 小見出し（「よく聴いた曲」など）・初披露の印 */
  accent: string;
  /** 数字の箱の背景（背景が透けても見分けがつく半透明の色） */
  boxFill: string;
  /** フッター（ロゴ・サイトの URL）。影は下に shadowY ずらしてぼかす（参戦記録の画像はずらさない）。outline は縁取りの色 */
  footer: { color: string; hostColor: string; shadow: string; shadowY: number; shadowBlur: number; outline?: string };
  /** 飾りの色：[先頭, 末尾]。glow は周りのぼかし */
  icons: [{ color: string; glow?: string; glowBlur?: number }, { color: string; glow?: string; glowBlur?: number }];
  /** カードの右上に置くレースのハートの色（無ければ置かない） */
  lace?: string;
  /** カードの右上に置く、色を並べた輪（メンバーカラーなど。無ければ置かない） */
  ring?: string[];
};

export const SHARE_THEMES: Record<ArtistTheme, ShareTheme> = {
  "sun-moon": {
    background: {
      angle: 105,
      stops: [
        [0, "#fff5d6"],
        [0.24, "#ffdca6"],
        [0.42, "#f7ae78"],
        [0.5, "#b4688f"],
        [0.58, "#5a4589"],
        [0.74, "#2f2c6c"],
        [1, "#1b1f4d"],
      ],
    },
    decoration: "stars",
    cardShadow: "rgba(30,20,60,.25)",
    heading: {
      kind: "gradient",
      stops: [
        [0, "#e98a1f"],
        [0.55, "#d9658a"],
        [1, "#4b3f9a"],
      ],
    },
    ink: "#4a3f7a",
    inkSoft: "#8a7fa8",
    accent: "#d4741c",
    boxFill: "rgba(90, 69, 137, 0.08)",
    footer: { color: "#fff", hostColor: "rgba(255,255,255,.92)", shadow: "rgba(30,20,60,.45)", shadowY: 1, shadowBlur: 6 },
    icons: [{ color: "#f39a1e", glow: "rgba(255,190,80,.9)", glowBlur: 10 }, { color: "#ffe7a6" }],
  },
  hearts: {
    background: {
      angle: 115,
      stops: [
        [0, "#bfe3f7"],
        [0.3, "#d9ecfa"],
        [0.62, "#f9d3e3"],
        [1, "#f6b6cf"],
      ],
    },
    decoration: "hearts",
    cardShadow: "rgba(40,50,110,.18)",
    heading: {
      kind: "outline",
      fill: "#1d3f8f",
      rings: [
        [3, "#fff"],
        [6, "#f27aa9"],
        [9, "#f27aa9"],
      ],
      drop: [12, "#f6b1cb"],
    },
    ink: "#1d3f8f",
    inkSoft: "#8f84a8",
    accent: "#d23a78",
    boxFill: "rgba(232, 80, 140, 0.07)",
    footer: { color: "#1d3f8f", hostColor: "#1d3f8f", shadow: "rgba(255,255,255,.8)", shadowY: 2, shadowBlur: 8, outline: "#fff" },
    icons: [
      { color: "#e8508c", glow: "#fff", glowBlur: 4 },
      { color: "#1d3f8f", glow: "#fff", glowBlur: 4 },
    ],
    lace: "#f4a3c4",
  },
  rainbow: {
    background: {
      angle: 100,
      stops: [
        [0, "#fde0ef"],
        [0.22, "#ffe6d6"],
        [0.42, "#fff3c4"],
        [0.6, "#e3f5d6"],
        [0.8, "#d9f1fd"],
        [1, "#e9e1fa"],
      ],
    },
    decoration: "petals",
    cardShadow: "rgba(160,133,215,.22)",
    heading: {
      kind: "outline",
      fill: "#fff",
      rings: [
        [3, "#fa7abc"],
        [6, "#fa7abc"],
        [8, "#fa7abc"],
      ],
      drop: [11, "#d9c8f5"],
    },
    ink: "#4b3d63",
    inkSoft: "#8e83a3",
    accent: "#d63f8c",
    boxFill: "rgba(250, 122, 188, 0.08)",
    footer: { color: "#c8327f", hostColor: "#c8327f", shadow: "rgba(255,255,255,.8)", shadowY: 2, shadowBlur: 8, outline: "#fff" },
    icons: [
      { color: "#fa7abc", glow: "#fff", glowBlur: 4 },
      { color: "#a085d7", glow: "#fff", glowBlur: 4 },
    ],
    ring: ["#fa7abc", "#ffb400", "#82d25a", "#28c3ff", "#a085d7"],
  },
};
