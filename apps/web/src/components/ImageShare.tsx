import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHydrated } from "../hydration.ts";
import { canCopyImage, canShareFiles, copyImage, isTouchDevice, safeFileName, saveImage } from "../share-image.ts";
import "./ShareDialog.css";

/**
 * ページの共有画像（ビルド時に作った /og/….png）だけを共有する。リンクを付けずに画像だけ投稿したいとき用。
 * - スマホ：OS の共有シートに画像だけを渡す（X・LINE への投稿や写真への保存）
 * - PC：画像をコピーして、X の投稿欄などに貼り付けてもらう
 * 画像はダイアログを開いたときに初めて読み込む（ページの表示を重くしない）。
 */
export function ImageShare({ src, fileName: name, alt }: { src: string; fileName: string; alt: string }) {
  const fileName = safeFileName(name);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [blob, setBlob] = useState<Blob>();
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const open = () => {
    setCopied(false);
    dialogRef.current?.showModal();
    if (blob) return;
    setFailed(false);
    fetch(src)
      .then((r) => (r.ok && r.headers.get("content-type")?.startsWith("image/") ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(setBlob)
      .catch(() => setFailed(true));
  };

  // 端末の種類・ブラウザの機能はブラウザで調べる（ビルド時の HTML では、どちらでもない形で描く）
  const hydrated = useHydrated();
  const touch = hydrated && isTouchDevice();
  const canShareFile = !!blob && canShareFiles(blob);
  const canCopy = hydrated && canCopyImage();
  // スマホは共有シート、PC はコピーを主にする
  const shareFirst = touch && canShareFile;
  const share = () => {
    if (blob) navigator.share({ files: [new File([blob], fileName, { type: "image/png" })] }).catch(() => {});
  };
  const copy = async () => {
    if (blob) setCopied(await copyImage(blob));
  };
  const objectUrl = useMemo(() => blob && URL.createObjectURL(blob), [blob]);
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );

  return (
    <>
      <button type="button" className="share-button" onClick={open}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3.5h11v9h-11zM2.5 10l3-3 3 3 2-2 3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        画像
      </button>
      <dialog ref={dialogRef} className="share-dialog" onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}>
        <div className="share-dialog-body">
          <h3 className="section-heading">画像で共有</h3>
          <div className="share-preview" style={{ "--share-ratio": "1200 / 630" } as CSSProperties}>
            {objectUrl && <img src={objectUrl} alt={alt} />}
            {!blob && (
              <p className="muted small share-loading">
                {failed ? "画像を読み込めませんでした（サイトの更新直後は、まだできていないことがあります）" : "画像を読み込んでいます…"}
              </p>
            )}
          </div>
          <div className="backup-actions">
            {shareFirst && (
              <button type="button" className="share-button primary" onClick={share}>
                画像を共有
              </button>
            )}
            {canCopy && !shareFirst && (
              <button type="button" className="share-button primary" onClick={() => void copy()} disabled={!blob}>
                {copied ? "✓ コピー済み" : "画像をコピー"}
              </button>
            )}
            <button type="button" className="share-button" onClick={() => blob && saveImage(blob, fileName)} disabled={!blob}>
              画像を保存
            </button>
            {canShareFile && !shareFirst && (
              <button type="button" className="share-button" onClick={share}>
                共有
              </button>
            )}
            <button type="button" className="share-button" onClick={() => dialogRef.current?.close()}>
              閉じる
            </button>
          </div>
          <p className="muted small">
            {shareFirst
              ? "「画像を共有」から X や LINE を選ぶと、リンクなしで画像だけを投稿できます。写真への保存もここから。"
              : copied
                ? "画像をコピーしました。X の投稿欄などに貼り付け（⌘V / Ctrl+V）てください。"
                : "リンクなしで画像だけを投稿したいときに。コピーして投稿欄に貼り付けるか、保存して添付してください。"}
          </p>
        </div>
      </dialog>
    </>
  );
}
