import { useEffect } from "react";
import { Link, useRouteError } from "react-router";
import { reportError } from "../error-report.ts";
import "./RouteError.css";

/**
 * ページの表示中にエラーが起きたときに出す画面（ルーターの errorElement）。
 * ページのコードを読み込めなかったとき（電波が途切れた・サイトが更新された直後など）もここに来る。
 */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => reportError("render", error), [error]);
  return (
    <div className="route-error" role="alert">
      <p>このページを表示できませんでした。</p>
      <p className="muted small">通信が不安定なときや、サイトが更新された直後に起きることがあります。</p>
      <p className="route-error-actions">
        <button type="button" className="share-button primary" onClick={() => location.reload()}>
          再読み込み
        </button>
        <Link to="/" className="share-button">
          トップへ
        </Link>
      </p>
    </div>
  );
}
