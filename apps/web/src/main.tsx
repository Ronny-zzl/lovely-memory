// ホーム画面への追加のイベントを、描画前から待ち受ける
import "./install.ts";
import { installErrorReporting, reportError } from "./error-report.ts";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { findArtist, loadArtistData } from "./data.ts";
import { routes } from "./routes.tsx";
import { installThemeSync } from "./theme.ts";
// サイト全体で使う見た目（ページ・部品ごとのものは、それぞれの .tsx の隣の .css）
import "./styles/tokens.css";
import "./styles/themes.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/dots.css";
import "./styles/stats.css";
import "./styles/chips.css";
import "./styles/badge.css";
import "./styles/event-list.css";
import "./styles/lists.css";
import "./styles/button.css";
import "./styles/motion.css";

// 起きたエラーをサイトに送る（読み込みの途中で起きたものも拾えるよう、最初に）
installErrorReporting();

// テーマ：端末の設定の変更・別のタブでの切り替えに付いていく
installThemeSync();

// 以前の hash ルーティング（/#/artist/...）のリンクを通常のパスに置き換える
if (location.hash.startsWith("#/")) {
  history.replaceState(null, "", location.hash.slice(1));
}

const router = createBrowserRouter(routes);

// URL のアーティストのデータを描画前に読み込んでおく（数ミリ秒で終わる）。
// 描画中に読み込むと「読み込み中」が一瞬出て、React の仕様で最低 300ms 表示が遅れる
const initialArtist = findArtist(location.pathname.split("/")[1]);
if (initialArtist) await loadArtistData(initialArtist).catch(() => {});

// 最初のページのコードも描画前に読み込んでおく（読み込み終わるまで画面が空にならないように）
await new Promise<void>((resolve) => {
  if (router.state.initialized) return resolve();
  const unsubscribe = router.subscribe((state) => {
    if (state.initialized) {
      unsubscribe();
      resolve();
    }
  });
});

// オフライン対応（ネットワーク優先。sw.js はビルド時に生成されるので本番ビルドのみ）
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// 見出し・数字の丸ゴシック。定義が大きいので、描画を止めないよう後から読み込む（src/fonts.css）。
// 読み込めなくても（サイトの更新直後など）端末の字体で表示できるので、エラーにしない
import("./fonts.css").catch(() => {});

// ビルド時に作った HTML（scripts/prerender.ts。#root の data-prerendered にそのパス）なら、それを引き継ぐ。
// 無いとき（開発時・404 のページなど）や、別のパスの中身のとき（以前の /#/… のリンクでトップの HTML が来た、など）はブラウザで描き直す
const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
const options = {
  onUncaughtError: (error: unknown) => reportError("render", error),
  onCaughtError: (error: unknown) => reportError("render", error),
  // ビルド時の HTML と食い違ったとき（その部分はブラウザで描き直される）
  onRecoverableError: (error: unknown) => reportError("render", error),
};
if (root.dataset.prerendered === location.pathname) hydrateRoot(root, app, options);
else createRoot(root, options).render(app);
