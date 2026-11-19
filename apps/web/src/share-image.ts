/*
 * 画像の共有で使う小さな道具（参戦記録のシェア画像・イベントや曲の共有画像）。
 * スマホは OS の共有シート、PC はクリップボードを主に使う。
 */

/** スマホ・タブレット（指で操作する端末） */
export const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;

/** OS の共有シートに画像を渡せるか */
export function canShareFiles(blob: Blob): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([blob], "card.png", { type: "image/png" })] });
}

/** 画像をクリップボードに書けるブラウザか */
export const canCopyImage = () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

/** 画像をクリップボードへ。できたら true */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** 画像をファイルとして保存（ダウンロード） */
export function saveImage(blob: Blob, fileName: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** ファイル名に使えない文字（/ : など）を置き換える */
export const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_");
