import { Suspense, use } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigation, useOutletContext, useParams } from "react-router";
import { MoonIcon, SunIcon } from "../components/Icons.tsx";
import { InstallButton } from "../components/InstallButton.tsx";
import { PageSkeleton } from "../components/PageSkeleton.tsx";
import { artistDataOn, findArtist, loadArtistData, type ArtistData } from "../data.ts";
import { useToday } from "../hydration.ts";
import type { ArtistConfig } from "@lovely-memory/core/runtime";

export function ArtistLayout() {
  const artist = findArtist(useParams().artistId);
  const { pathname } = useLocation();
  // 開くページのコードを読み込んでいる間（初めて開くタブなど）
  const loading = useNavigation().state === "loading";
  if (!artist) return <Navigate to="/" replace />;

  return (
    <div className="page">
      <header className="site-header hero">
        <div className="hero-card">
          <InstallButton />
          <Link to="/" className="brand">
            <span className="sun">
              <SunIcon />
            </span>
            ラブリィメモリー
            <span className="moon">
              <MoonIcon />
            </span>
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
            <NavLink to="trends">傾向</NavLink>
            <NavLink to="members">メンバー</NavLink>
            <NavLink to="attendance">参戦記録</NavLink>
          </nav>
        </div>
      </header>
      {loading && <div className="route-progress" aria-hidden="true" />}
      <main>
        <Suspense fallback={<PageSkeleton />}>
          {/* ページが変わるたびに中身をふわっと出す（styles/motion.css） */}
          <div key={pathname} className="page-enter">
            <ArtistOutlet artist={artist} />
          </div>
        </Suspense>
      </main>
    </div>
  );
}

function ArtistOutlet({ artist }: { artist: ArtistConfig }) {
  const data = artistDataOn(use(loadArtistData(artist)), useToday());
  return <Outlet context={data} />;
}

/** 子ページから読み込み済みのアーティストデータを受け取る */
export function useArtistData(): ArtistData {
  return useOutletContext<ArtistData>();
}
