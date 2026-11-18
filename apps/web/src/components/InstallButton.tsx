import { useEffect, useRef, useState } from "react";
import { useInstallState } from "../install.ts";
import "./InstallButton.css";

/** ヘッダー右上の「ホーム画面に追加」ボタン。追加できない環境・追加済みなら何も出さない */
export function InstallButton() {
  const state = useInstallState();
  const [help, setHelp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 説明の吹き出しは外側をタップしたら閉じる
  useEffect(() => {
    if (!help) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setHelp(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [help]);

  if (state.kind === "none") return null;
  const onClick = () => (state.kind === "prompt" ? void state.install() : setHelp((v) => !v));

  return (
    <div className="install" ref={ref}>
      <button type="button" className="install-button" onClick={onClick} aria-expanded={state.kind === "ios" ? help : undefined}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        ホーム画面に追加
      </button>
      {help && (
        <div className="install-help" role="dialog" aria-label="ホーム画面に追加する方法">
          <p>
            画面の
            <svg viewBox="0 0 16 16" role="img" aria-label="共有" className="share-icon">
              <path
                d="M8 1.5v8.5M5 4.5 8 1.5l3 3M4.5 7H3.5v7.5h9V7h-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            共有ボタンから「<strong>ホーム画面に追加</strong>」を選んでください。
          </p>
          <p className="muted small">アプリのように全画面で開けて、オフラインでも見られます。</p>
        </div>
      )}
    </div>
  );
}
