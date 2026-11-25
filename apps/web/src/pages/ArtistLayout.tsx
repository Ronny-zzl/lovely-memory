import { Suspense, use, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigation, useOutletContext, useParams } from "react-router";
import { MoonIcon, SunIcon } from "../components/Icons.tsx";
import { InstallButton } from "../components/InstallButton.tsx";
import { PageSkeleton } from "../components/PageSkeleton.tsx";
import { ThemeSwitch } from "../components/ThemeSwitch.tsx";
import { artistDataOn, findArtist, loadArtistData, type ArtistData } from "../data.ts";
import { useToday } from "../hydration.ts";
import { orderMembers, type ArtistConfig } from "@lovely-memory/core/runtime";
import { dotStyle } from "../member-color.ts";
import { MemberStatus } from "../components/MemberStatus.tsx";

export function ArtistLayout() {
  const artist = findArtist(useParams().artistId);
  const { pathname } = useLocation();
  const today = useToday();
  // 開くページのコードを読み込んでいる間（初めて開くタブなど）
  const loading = useNavigation().state === "loading";
  // 最初に開いたページは、ビルド時の HTML でもう見えているので、ふわっとは出さない。
  // 一度でもサイト内で移動したら、その後は（最初のページに戻るときも）出す
  const [nav, setNav] = useState({ first: pathname, moved: false });
  if (!nav.moved && pathname !== nav.first) setNav({ ...nav, moved: true });
  const fadeIn = nav.moved || pathname !== nav.first;
  if (!artist) return <Navigate to="/" replace />;

  return (
    <div className="page">
      <header className="site-header hero">
        <div className="hero-card">
          <div className="hero-actions">
            <InstallButton />
            <ThemeSwitch />
          </div>
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
            {orderMembers(artist.members, today).map((m) => (
              <li key={m.id}>
                <span className="dot" style={dotStyle(m.color)} />
                {m.name}
                <MemberStatus member={m} today={today} />
              </li>
            ))}
          </ul>
          <nav className="tabs">
            <NavLink to="songs">楽曲</NavLink>
            <NavLink to="events">イベント</NavLink>
            <NavLink to="trends">傾向</NavLink>
            <NavLink to="members">メンバー</NavLink>
            <NavLink to="attendance">参戦記録</NavLink>
            {__EDITOR__ && <NavLink to="edit">入力</NavLink>}
          </nav>
        </div>
      </header>
      {loading && <div className="route-progress" aria-hidden="true" />}
      <main>
        <Suspense fallback={<PageSkeleton />}>
          {/* ページが変わるたびに中身をふわっと出す（styles/motion.css） */}
          <div key={pathname} className={fadeIn ? "page-enter" : undefined}>
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
