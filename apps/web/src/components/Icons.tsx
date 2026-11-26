import { THEME_ICONS, type ArtistTheme, type MotifIcon } from "@lovely-memory/core/runtime";

/** 太陽と月の意匠（ユニットのタグ・サイトのロゴ）。色は currentColor */

export function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1="8" y1="1.6" x2="8" y2="3" transform={`rotate(${i * 45} 8 8)`} />
        ))}
      </g>
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.2 2.2A6 6 0 1 0 13.8 11 4.8 4.8 0 0 1 10.2 2.2Z" fill="currentColor" />
      <path d="M13 2.4l.35.9.9.35-.9.35-.35.9-.35-.9-.9-.35.9-.35Z" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

/** ハートと王冠（Mi'Line Hearts のロゴの意匠）。色は currentColor */

export function HeartIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 14s-5.2-3.2-6.4-6.4A3.4 3.4 0 0 1 8 4.4a3.4 3.4 0 0 1 6.4 3.2C13.2 10.8 8 14 8 14Z" fill="currentColor" />
    </svg>
  );
}

export function CrownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 5.2l3.2 2.6L8 3.4l2.8 4.4L14 5.2l-1.3 6.6H3.3Z" fill="currentColor" strokeLinejoin="round" />
      <rect x="3.3" y="12.6" width="9.4" height="1.6" rx="0.8" fill="currentColor" />
    </svg>
  );
}

const MOTIF_ICONS: Record<MotifIcon, () => React.JSX.Element> = { sun: SunIcon, moon: MoonIcon, heart: HeartIcon, crown: CrownIcon };

/** テーマの飾り：[先頭（ロゴの左・1 曲目）, 末尾（ロゴの右・ラスト）]（@lovely-memory/core の THEME_ICONS） */
export function themeIcons(theme: ArtistTheme): [() => React.JSX.Element, () => React.JSX.Element] {
  const [start, end] = THEME_ICONS[theme];
  return [MOTIF_ICONS[start], MOTIF_ICONS[end]];
}
