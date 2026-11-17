import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { ArtistLayout } from "./pages/ArtistLayout.tsx";
import { ArtistList } from "./pages/ArtistList.tsx";
import { EventDetailPage } from "./pages/EventDetailPage.tsx";
import { EventsPage } from "./pages/EventsPage.tsx";
import { MembersPage } from "./pages/MembersPage.tsx";
import { SongDetailPage } from "./pages/SongDetailPage.tsx";
import { SongStatsPage } from "./pages/SongStatsPage.tsx";
import { TrendsPage } from "./pages/TrendsPage.tsx";
import "./styles.css";

// 以前の hash ルーティング（/#/artist/...）のリンクを通常のパスに置き換える
if (location.hash.startsWith("#/")) {
  history.replaceState(null, "", location.hash.slice(1));
}

// Cloudflare Pages は存在しないパスに index.html を返す（SPA フォールバック）ので、通常のパスでルーティングする
const router = createBrowserRouter([
  { path: "/", element: <ArtistList /> },
  {
    path: "/:artistId",
    element: <ArtistLayout />,
    children: [
      { index: true, element: <Navigate to="songs" replace /> },
      { path: "songs", element: <SongStatsPage /> },
      { path: "songs/:songId", element: <SongDetailPage /> },
      { path: "events", element: <EventsPage /> },
      { path: "events/:eventId", element: <EventDetailPage /> },
      { path: "trends", element: <TrendsPage /> },
      { path: "members", element: <MembersPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
