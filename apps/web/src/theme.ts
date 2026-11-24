/*
 * 太陽（light）と月夜（dark）のテーマ。
 * 最初の描画の前に index.html のスクリプトが <html data-theme> を決める（ちらつかないように）。ここではその後の切り替えを扱う。
 * 選んだテーマは localStorage に覚える。端末の設定と同じテーマを選んだら覚えたものを消して、また端末の設定に従う。
 */
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const KEY = "theme";
const listeners = new Set<() => void>();

const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

function storedTheme(): Theme | undefined {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : undefined;
  } catch {
    return undefined;
  }
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // ブラウザの枠（アドレスバーなど）の色をページの背景に合わせる
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  for (const l of listeners) l();
}

function setTheme(theme: Theme) {
  try {
    if (theme === systemTheme()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // 覚えられなくても、このページでは切り替える
  }
  apply(theme);
}

/** 端末の設定の変更・別のタブでの切り替えに付いていく（main.tsx で一度だけ呼ぶ） */
export function installThemeSync() {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!storedTheme()) apply(systemTheme());
  });
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) apply(storedTheme() ?? systemTheme());
  });
  apply(storedTheme() ?? systemTheme());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 今のテーマ。ビルド時の描画と引き継ぎの最初の描画では分からないので undefined（見た目は CSS が data-theme で決める） */
export function useTheme(): Theme | undefined {
  return useSyncExternalStore(subscribe, currentTheme, () => undefined);
}

/**
 * テーマを切り替える。対応しているブラウザでは、新しいテーマが from の位置から円く広がって画面を塗り替える。
 * 「視差効果を減らす」を選んでいる人には、すぐに切り替える
 */
export function toggleTheme(from: Element) {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof document.startViewTransition !== "function") return setTheme(next);

  const rect = from.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  // いちばん遠い画面の角まで届く半径
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const root = document.documentElement;
  root.classList.add("theme-transition");
  const transition = document.startViewTransition(() => setTheme(next));
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 700, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
  void transition.finished.finally(() => root.classList.remove("theme-transition"));
}
