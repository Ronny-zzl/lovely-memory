import type { ReactNode } from "react";
import { Link } from "react-router";
import "./PlainPage.css";

/** グループに属さない、文章だけのページ（プライバシーポリシー・招待）の枠。見出しとトップへのリンク */
export function PlainPage({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className="page">
      <header className="site-header">
        <div className="hero-card">
          <Link to="/" className="brand">
            ラブリィメモリー
          </Link>
          <h1 className="site-title">{title}</h1>
        </div>
      </header>
      <main className={className ? `plain-page ${className}` : "plain-page"}>{children}</main>
    </div>
  );
}
