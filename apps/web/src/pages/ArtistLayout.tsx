import { Suspense, use } from "react";
import { Link, Navigate, NavLink, Outlet, useOutletContext, useParams } from "react-router";
import { findArtist, loadArtistData, type ArtistData } from "../data.ts";
import type { ArtistConfig } from "@lovely-memory/core/runtime";

export function ArtistLayout() {
  const artist = findArtist(useParams().artistId);
  if (!artist) return <Navigate to="/" replace />;

  return (
    <div className="page">
      <header className="site-header">
        <Link to="/" className="breadcrumb">
          ラブリィメモリー
        </Link>
        <h1 className="site-title">
          {artist.name}
          {artist.subtitle && <span className="subtitle">{artist.subtitle}</span>}
        </h1>
        <ul className="member-legend">
          {artist.members.map((m) => (
            <li key={m.id}>
              <span className="dot" style={{ background: m.color }} />
              {m.name}
            </li>
          ))}
        </ul>
        <nav className="tabs">
          <NavLink to="songs">楽曲</NavLink>
          <NavLink to="events">公演</NavLink>
          <NavLink to="members">メンバー</NavLink>
        </nav>
      </header>
      <Suspense fallback={<p className="muted">読み込み中…</p>}>
        <ArtistOutlet artist={artist} />
      </Suspense>
    </div>
  );
}

function ArtistOutlet({ artist }: { artist: ArtistConfig }) {
  const data = use(loadArtistData(artist));
  return <Outlet context={data} />;
}

/** 子ページから読み込み済みのアーティストデータを受け取る */
export function useArtistData(): ArtistData {
  return useOutletContext<ArtistData>();
}
