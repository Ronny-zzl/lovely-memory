import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import "./AccountMenu.css";

type Me = { email: string; admin: boolean };

/**
 * ヘッダー右上の「アカウント」（プレビュー版だけ。__EDITOR__ のときに置く）。
 * 押すと、ログイン中の Google アカウント（/api/me）・招待のページ（管理者だけ）・ログアウトを出す。
 * ログアウトは Cloudflare Access の /cdn-cgi/access/logout（サイトの外の処理なのでページごと移動する）
 */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | "error">();
  const ref = useRef<HTMLDivElement>(null);

  // 初めて開いたときに読み込む
  useEffect(() => {
    if (!open || me) return;
    fetch("/api/me")
      .then(async (res) => (res.ok ? setMe((await res.json()) as Me) : setMe("error")))
      .catch(() => setMe("error"));
  }, [open, me]);

  // 外側をタップしたら閉じる
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-button" onClick={() => setOpen((v) => !v)} aria-label="アカウント" aria-expanded={open}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="5.5" r="2.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M2.75 14c.6-2.9 2.7-4.5 5.25-4.5s4.65 1.6 5.25 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div className="account-menu" role="dialog" aria-label="アカウント">
          <p className="muted small">ログイン中</p>
          <p className="account-email">{me === undefined ? "読み込み中…" : me === "error" ? "読み込めませんでした" : me.email}</p>
          <div className="account-actions">
            {me !== undefined && me !== "error" && me.admin && (
              <Link to="/invite" className="share-button" onClick={() => setOpen(false)}>
                招待
              </Link>
            )}
            <a href="/cdn-cgi/access/logout" className="share-button">
              ログアウト
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
