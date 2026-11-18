import { useState } from "react";

/**
 * ページの共有ボタン。X は投稿画面へのリンク（intent）なので、X のスクリプトは読み込まない。
 * リンクのコピーと、OS の共有シート（Web Share API）が使える端末では「共有」ボタンも出す（LINE などへ）。
 */
export function ShareButtons({ text, hashtags = [] }: { text: string; hashtags?: string[] }) {
  const [copied, setCopied] = useState(false);
  // 共有するのは正式ドメインのパス（クエリ・ハッシュは付けない）
  const url = location.origin + location.pathname;
  // hashtags・url パラメータだと並び順を選べないので、本文・ハッシュタグ・URL を改行区切りで 1 つの本文にする
  const tags = hashtags.map((h) => `#${h}`).join(" ");
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", [text, tags, url].filter(Boolean).join("\n"));

  const canShare = typeof navigator.share === "function";
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
    </div>
  );
}
