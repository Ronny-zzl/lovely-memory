/*
 * ブラウザで起きたエラーをサイトの API（/api/errors）に送る。中身は pnpm lm errors で見る。
 * 送るのはエラーの内容とページのパス・ビルドだけ（参戦記録などの個人の記録は送らない）。
 */

export type ErrorKind = "error" | "rejection" | "render";

/** 1 回開いたページから送る上限（同じエラーが繰り返し起きても送りすぎないように） */
const MAX_REPORTS = 5;
let sent = 0;
const seen = new Set<string>();

/** ブラウザの拡張機能など、このサイトのコードではないところで起きたもの */
function isNoise(message: string, stack: string | undefined): boolean {
  if (message === "Script error." || message === "Script error") return true;
  return /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack ?? "");
}

export function reportError(kind: ErrorKind, error: unknown): void {
  if (!import.meta.env.PROD) return;
  const e = error instanceof Error ? error : undefined;
  const message = (e ? `${e.name}: ${e.message}` : String(error)).slice(0, 500);
  const stack = e?.stack?.slice(0, 4000);
  if (isNoise(message, stack)) return;
  // 同じエラーを 2 回送らない（React とルーターの両方から届くことがある）
  const key = `${message}\n${stack?.split("\n")[1] ?? ""}`;
  if (seen.has(key) || sent >= MAX_REPORTS) return;
  seen.add(key);
  sent++;

  const body = JSON.stringify({ kind, message, stack, path: location.pathname, build: __BUILD__ });
  try {
    // ページを閉じる直前でも届くように sendBeacon。text/plain なら余計な確認のリクエストが出ない
    if (navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "text/plain" }))) return;
  } catch {
    // 下の fetch で送る
  }
  fetch("/api/errors", { method: "POST", body, keepalive: true }).catch(() => {});
}

/** window のエラーと、処理されなかった Promise のエラーを送る */
export function installErrorReporting(): void {
  window.addEventListener("error", (e) => reportError("error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("rejection", e.reason));
}
