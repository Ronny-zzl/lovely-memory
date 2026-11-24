/*
 * サイトを更新した直後は、新しい HTML が読み込むコードのファイルが、まだ手元の CDN に届いていないことがある
 * （2026-11-24：デプロイの 17 秒後に開いたページで起きた）。また、更新前に開いたままのタブで別のページへ移ると、
 * 古いコードのファイルはもう無い。どちらも、ページを読み込み直せば直る。
 *
 * そこで、コードを読み込めなかったら一度だけ自動で読み込み直す。その間はエラーの画面も報告も出さない。
 * 読み込み直してもまた失敗する（60 秒以内の 2 回目）・オフラインのときは、いつも通りエラーにする（エラーの画面と報告）。
 */

const KEY = "lovely-memory:chunk-reload";
const WINDOW_MS = 60_000;

/** コード（JS・CSS）のファイルを読み込めなかったエラーか（ブラウザごとに文言が違う） */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    message,
  );
}

/** 読み込み直すなら true。直前に読み込み直したばかり・オフライン・記録できない（プライベートモードなど）なら false（繰り返さない） */
function reloadOnce(): boolean {
  if (!navigator.onLine) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY));
    if (last && Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/**
 * import() を包む。コードを読み込めなければ一度だけページを読み込み直し、それまで終わらない Promise を返す
 * （今の画面のまま待つ）。それ以外のエラー・2 回目の失敗はそのまま投げる
 */
export async function importOrReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isChunkLoadError(error) && reloadOnce()) return new Promise<T>(() => {});
    throw error;
  }
}
