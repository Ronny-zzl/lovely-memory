import { toggleTheme, useTheme } from "../theme.ts";
import "./ThemeSwitch.css";

/**
 * ヘッダー右上の、太陽（light）と月夜（dark）の切り替えスイッチ。
 * 昼の空の太陽が、右へ転がりながら星空の月に欠けていく。見た目は <html data-theme> から CSS で決める
 * （ビルド時の HTML ではテーマが分からないため）
 */
export function ThemeSwitch() {
  const theme = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      className="theme-switch"
      aria-checked={dark}
      aria-label="月夜のテーマ"
      title={theme && (dark ? "太陽のテーマにする" : "月夜のテーマにする")}
      onClick={toggleTheme}
    >
      <span className="ts-sky ts-day" aria-hidden="true">
        <svg className="ts-cloud" viewBox="0 0 24 12">
          <path d="M5 11.5a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8.5-1.5A3.8 3.8 0 0 1 19.5 6 2.75 2.75 0 0 1 19.5 11.5Z" fill="currentColor" />
        </svg>
      </span>
      <span className="ts-sky ts-night" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <svg key={i} className={`ts-star ts-star-${i}`} viewBox="0 0 8 8">
            <path d="M4 0l.9 3.1L8 4l-3.1.9L4 8l-.9-3.1L0 4l3.1-.9Z" fill="currentColor" />
          </svg>
        ))}
      </span>
      <span className="ts-knob" aria-hidden="true">
        <svg className="ts-rays" viewBox="0 0 32 32">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {Array.from({ length: 8 }, (_, i) => (
              <line key={i} x1="16" y1="1.5" x2="16" y2="4" transform={`rotate(${i * 45} 16 16)`} />
            ))}
          </g>
        </svg>
        <span className="ts-orb" />
      </span>
    </button>
  );
}
