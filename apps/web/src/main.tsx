// ホーム画面への追加のイベントを、描画前から待ち受ける
import "./install.ts";
import { type ComponentType, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router";
import { ArtistLayout } from "./pages/ArtistLayout.tsx";
import { findArtist, loadArtistData } from "./data.ts";
// サイト全体で使う見た目（ページ・部品ごとのものは、それぞれの .tsx の隣の .css）
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/dots.css";
import "./styles/stats.css";
import "./styles/chips.css";
import "./styles/badge.css";
import "./styles/event-list.css";
import "./styles/lists.css";
import "./styles/button.css";

// 以前の hash ルーティング（/#/artist/...）のリンクを通常のパスに置き換える
if (location.hash.startsWith("#/")) {
  history.replaceState(null, "", location.hash.slice(1));
}

// 各ページのコードは開いたときに読み込む（最初に読み込む量を減らす）。
// 移動先のページの読み込みが終わるまで今のページを表示したままにするので、「読み込み中」は出ない
const page = (load: () => Promise<ComponentType>): Pick<RouteObject, "lazy"> => ({
  lazy: async () => ({ Component: await load() }),
});

// Cloudflare Pages は存在しないパスに index.html を返す（SPA フォールバック）ので、通常のパスでルーティングする
const router = createBrowserRouter([
  { path: "/", ...page(() => import("./pages/ArtistList.tsx").then((m) => m.ArtistList)) },
  {
    path: "/:artistId",
    element: <ArtistLayout />,
    children: [
      { index: true, element: <Navigate to="songs" replace /> },
      { path: "songs", ...page(() => import("./pages/SongStatsPage.tsx").then((m) => m.SongStatsPage)) },
      { path: "songs/:songId", ...page(() => import("./pages/SongDetailPage.tsx").then((m) => m.SongDetailPage)) },
      { path: "events", ...page(() => import("./pages/EventsPage.tsx").then((m) => m.EventsPage)) },
      { path: "events/:eventId", ...page(() => import("./pages/EventDetailPage.tsx").then((m) => m.EventDetailPage)) },
      { path: "trends", ...page(() => import("./pages/TrendsPage.tsx").then((m) => m.TrendsPage)) },
      { path: "members", ...page(() => import("./pages/MembersPage.tsx").then((m) => m.MembersPage)) },
      { path: "attendance", ...page(() => import("./pages/AttendancePage.tsx").then((m) => m.AttendancePage)) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
