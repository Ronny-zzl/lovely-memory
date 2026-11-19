import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cardChars, drawAttendanceCard, loadCardFont, type AttendanceCardData } from "../attendance-card.ts";
import { canCopyImage, canShareFiles, copyImage, isTouchDevice, saveImage } from "../share-image.ts";
import "./ShareDialog.css";

/**
 * 参戦記録のシェア画像。
 * - スマホ：OS の共有シートに画像を添えて渡す（X・LINE などにそのまま投稿できる）
 * - PC：画像を保存して、X の投稿画面（本文入り）に手で添付してもらう
 */
export function AttendanceShare({
  card,
  postText,
  hashtags,
  fileName,
}: {
  card: AttendanceCardData;
  postText: string;
  hashtags: string[];
  fileName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blob, setBlob] = useState<Blob>();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadCardFont(cardChars(card)).then(() => {
      if (cancelled || !canvasRef.current) return;
      drawAttendanceCard(canvasRef.current, card);
      canvasRef.current.toBlob((b) => {
        if (cancelled || !b) return;
        setBlob(b);
        // PC ではできあがった画像をそのままクリップボードへ（X の投稿欄に貼り付けるだけで済むように）。
        // ブラウザによってはクリック中でないと書き込めないので、失敗しても何も出さない（下のボタンで改めてコピーできる）
        if (!isTouchDevice()) void copyImage(b).then(setCopied);
      }, "image/png");
    });
    return () => {
      cancelled = true;
    };
  }, [open, card]);

  const url = location.origin + location.pathname;
  const text = [postText, hashtags.map((h) => `#${h}`).join(" "), url].filter(Boolean).join("\n");
  const file = blob && new File([blob], fileName, { type: "image/png" });
  const touch = isTouchDevice();
  const canShareFile = !!blob && canShareFiles(blob);
  const canCopy = canCopyImage();
  // スマホは共有シート、PC はコピー＆貼り付けを主にする
  const shareFirst = touch && canShareFile;

  const save = () => {
    if (blob) saveImage(blob, fileName);
  };
  const share = () => {
    if (file) navigator.share({ files: [file], text }).catch(() => {});
  };
  const copy = async () => {
    if (blob) setCopied(await copyImage(blob));
  };
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", text);

  return (
    <>
      <button
        type="button"
        className="share-button"
        onClick={() => {
          // 前回の画像は内容が古いかもしれないので、描き直すまで出さない
          setBlob(undefined);
          setCopied(false);
          setOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3.5h11v9h-11zM2.5 10l3-3 3 3 2-2 3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        参戦記録をシェア
      </button>
      <dialog
        ref={dialogRef}
        className="share-dialog"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
      >
        <div className="share-dialog-body">
          <h3 className="section-heading">参戦記録をシェア</h3>
          <div className="share-preview" style={{ "--share-ratio": "1200 / 675" } as CSSProperties}>
            <canvas ref={canvasRef} role="img" aria-label="参戦記録のシェア画像" />
            {!blob && <p className="muted small share-loading">画像を作っています…</p>}
          </div>
          <div className="backup-actions">
            {shareFirst && (
              <button type="button" className="share-button primary" onClick={share} disabled={!blob}>
                画像を添えて共有
              </button>
            )}
            {canCopy && !shareFirst && (
              <button type="button" className="share-button" onClick={() => void copy()} disabled={!blob}>
                {copied ? "✓ コピー済み" : "画像をコピー"}
              </button>
            )}
            <button type="button" className="share-button" onClick={save} disabled={!blob}>
              画像を保存
            </button>
            <a
              className="share-button share-x"
              href={intent.toString()}
              target="_blank"
              rel="noopener noreferrer"
              // 投稿画面を開く前に画像をコピーしておく（クリック中なので Safari でも書き込める）
              onClick={() => {
                if (canCopy && !shareFirst && !copied) void copy();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                />
              </svg>
              ポスト
            </a>
            {canShareFile && !shareFirst && (
              <button type="button" className="share-button" onClick={share} disabled={!blob}>
                共有
              </button>
            )}
            <button type="button" className="share-button" onClick={() => dialogRef.current?.close()}>
              閉じる
            </button>
          </div>
          <p className="muted small">
            {shareFirst
              ? "「画像を添えて共有」から X や LINE を選ぶと、画像付きで投稿できます。"
              : copied
                ? "画像をコピーしました。「ポスト」で開く投稿欄に貼り付け（⌘V / Ctrl+V）てください。"
                : canCopy
                  ? "「ポスト」を押すと画像をコピーしてから投稿画面を開きます。投稿欄に貼り付け（⌘V / Ctrl+V）てください。"
                  : "X の投稿画面には画像を自動で付けられないので、保存した画像を添付してください。"}
          </p>
        </div>
      </dialog>
    </>
  );
}
