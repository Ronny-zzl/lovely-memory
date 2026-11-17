import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { ArtistLayout } from "./pages/ArtistLayout.tsx";
import { ArtistList } from "./pages/ArtistList.tsx";
import { EventDetailPage } from "./pages/EventDetailPage.tsx";
import { EventsPage } from "./pages/EventsPage.tsx";
import { MembersPage } from "./pages/MembersPage.tsx";
import { SongDetailPage } from "./pages/SongDetailPage.tsx";
import { SongStatsPage } from "./pages/SongStatsPage.tsx";
import "./styles.css";

// GitHub Pages は SPA のフォールバックが無いので hash ルーティングを使う
const router = createHashRouter([
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
