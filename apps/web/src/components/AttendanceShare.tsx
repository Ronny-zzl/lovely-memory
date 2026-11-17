import { useEffect, useRef, useState } from "react";
import { cardChars, drawAttendanceCard, loadCardFont, type AttendanceCardData } from "../attendance-card.ts";

/**
 * 参戦記録のシェア画像。
 * - スマホ：OS の共有シートに画像を添えて渡す（X・LINE などにそのまま投稿できる）
 * - PC：画像を保存して、X の投稿画面（本文入り）に手で添付してもらう
 */
/** スマホ・タブレット（指で操作する端末）。共有シートを主に使い、PC ではクリップボードを主に使う */
const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;

/** OS の共有シートに画像を渡せるか */
function canShareFiles(blob: Blob): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([blob], "card.png", { type: "image/png" })] });
}

/** 画像をクリップボードへ。できたら true */
async function copyImage(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

export function AttendanceShare({ card, postText, hashtags, fileName }: { card: AttendanceCardData; postText: string; hashtags: string[]; fileName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blob, setBlob] = useState<Blob>();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBlob(undefined);
    setCopied(false);
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
  }, [open, JSON.stringify(card)]);

  const url = location.origin + location.pathname;
  const text = [postText, hashtags.map((h) => `#${h}`).join(" "), url].filter(Boolean).join("\n");
  const file = blob && new File([blob], fileName, { type: "image/png" });
  const touch = isTouchDevice();
  const canShareFile = !!blob && canShareFiles(blob);
  const canCopy = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
  // スマホは共有シート、PC はコピー＆貼り付けを主にする
  const shareFirst = touch && canShareFile;

  const save = () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
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
          <div className="share-preview">
            <canvas ref={canvasRef} aria-label="参戦記録のシェア画像" />
            {!blob && <p className="muted small share-loading">画像を作っています…</p>}
          </div>
          <div className="backup-actions">
            {shareFirst && (
              <button type="button" className="share-button primary" onClick={share} disabled={!blob}>
                画像を添えて共有
              </button>
            )}
            {canCopy && !shareFirst && (
              <button type="button" className="share-button" onClick={copy} disabled={!blob}>
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
