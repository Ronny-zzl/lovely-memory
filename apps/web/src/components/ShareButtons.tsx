import { useState } from "react";
import { X_TEXT_LIMIT, xTextLength } from "@lovely-memory/core/runtime";
import { useLocation } from "react-router";
import { useHydrated, useOrigin } from "../hydration.ts";
import { ImageShare } from "./ImageShare.tsx";
import "./ShareButtons.css";

/**
 * ページの共有ボタン。X は投稿画面へのリンク（intent）なので、X のスクリプトは読み込まない。
 * リンクのコピーと、OS の共有シート（Web Share API）が使える端末では「共有」ボタンも出す（LINE などへ）。
 * image があれば「画像」ボタンも出す（リンクを付けずに共有画像だけを投稿したいとき用）。
 * copyText があれば「セトリをコピー」などのボタンも出す（文字で投稿したいとき用）。
 */
export function ShareButtons({
  text,
  hashtags = [],
  image,
  copyText,
}: {
  text: string;
  hashtags?: string[];
  image?: { src: string; fileName: string; alt: string };
  copyText?: { label: string; text: () => string };
}) {
  const [copied, setCopied] = useState(false);
  /** コピーした文字の X での文字数（上限を超えていたら知らせる） */
  const [copiedText, setCopiedText] = useState<number>();
  // 共有するのは正式ドメインのパス（クエリ・ハッシュは付けない）
  const url = useOrigin() + useLocation().pathname;
  // hashtags・url パラメータだと並び順を選べないので、本文・ハッシュタグ・URL を改行区切りで 1 つの本文にする
  const tags = hashtags.map((h) => `#${h}`).join(" ");
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", [text, tags, url].filter(Boolean).join("\n"));

  // 共有シートの有無はブラウザで調べる（ビルド時の HTML では出さない）
  const canShare = useHydrated() && typeof navigator.share === "function";
  const share = () => navigator.share({ title: document.title, text, url }).catch(() => {});
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };

  const copyAll = async () => {
    if (!copyText) return;
    const body = copyText.text();
    try {
      await navigator.clipboard.writeText(body);
      setCopiedText(xTextLength(body));
      setTimeout(() => setCopiedText(undefined), 4000);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };

  return (
    <div className="share-buttons">
      <a className="share-button share-x" href={intent.toString()} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
          />
        </svg>
        ポスト
      </a>
      <button type="button" className="share-button" onClick={() => void copy()}>
        {copied ? "コピーしました" : "リンクをコピー"}
      </button>
      {canShare && (
        <button type="button" className="share-button" onClick={() => void share()}>
          共有
        </button>
      )}
      {image && <ImageShare {...image} />}
      {copyText && (
        <button type="button" className="share-button" onClick={() => void copyAll()}>
          {copiedText === undefined ? copyText.label : "コピーしました"}
        </button>
      )}
      {copiedText !== undefined && copiedText > X_TEXT_LIMIT && (
        <p className="share-note muted small" role="status">
          X の文字数の上限（{X_TEXT_LIMIT}）を超えています（{copiedText}）。分けて投稿するか、削ってください。
        </p>
      )}
    </div>
  );
}
