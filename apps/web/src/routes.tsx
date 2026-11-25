import type { ComponentType } from "react";
import { Navigate, type RouteObject } from "react-router";
import { importOrReload } from "./chunk-reload.ts";
import { ArtistLayout } from "./pages/ArtistLayout.tsx";
import { RouteError } from "./pages/RouteError.tsx";

/*
 * ページの一覧。ブラウザ（main.tsx）と、ビルド時に HTML を作る描画（entry-server.tsx）で同じものを使う。
 * 各ページのコードは開いたときに読み込む（最初に読み込む量を減らす）。
 * 移動先のページの読み込みが終わるまで今のページを表示したままにするので、「読み込み中」は出ない
 */
// コードを読み込めなかったら一度だけ読み込み直す（サイトの更新直後など。chunk-reload.ts）
const page = (load: () => Promise<ComponentType>): Pick<RouteObject, "lazy"> => ({
  lazy: async () => ({ Component: await importOrReload(load) }),
});

export const routes: RouteObject[] = [
  { path: "/", ...page(() => import("./pages/ArtistList.tsx").then((m) => m.ArtistList)), errorElement: <RouteError /> },
  {
    path: "/:artistId",
    element: <ArtistLayout />,
    errorElement: <RouteError />,
    children: [
      {
        // ページでエラーが起きても、ヘッダー（タブ）は残して中身だけエラーの表示にする
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Navigate to="songs" replace /> },
          { path: "songs", ...page(() => import("./pages/SongStatsPage.tsx").then((m) => m.SongStatsPage)) },
          { path: "songs/:songId", ...page(() => import("./pages/SongDetailPage.tsx").then((m) => m.SongDetailPage)) },
          { path: "events", ...page(() => import("./pages/EventsPage.tsx").then((m) => m.EventsPage)) },
          { path: "events/:eventId", ...page(() => import("./pages/EventDetailPage.tsx").then((m) => m.EventDetailPage)) },
          { path: "trends", ...page(() => import("./pages/TrendsPage.tsx").then((m) => m.TrendsPage)) },
          { path: "members", ...page(() => import("./pages/MembersPage.tsx").then((m) => m.MembersPage)) },
          { path: "attendance", ...page(() => import("./pages/AttendancePage.tsx").then((m) => m.AttendancePage)) },
          // 入力画面（プレビュー版だけ）
          ...(__EDITOR__
            ? [
                { path: "edit", ...page(() => import("./pages/EditIndexPage.tsx").then((m) => m.EditIndexPage)) },
                { path: "edit/:eventId", ...page(() => import("./pages/SetlistEditorPage.tsx").then((m) => m.SetlistEditorPage)) },
              ]
            : []),
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];
