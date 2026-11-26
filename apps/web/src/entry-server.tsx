/*
 * ビルド時に、各ページを HTML に描く（scripts/prerender.ts から使う。vite build --ssr でこのファイルを入口にする）。
 * ブラウザでは main.tsx がこの HTML を引き継ぐ（hydrate）。
 */
import { StrictMode } from "react";
import { prerender } from "react-dom/static";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import { artists, loadArtistData } from "./data.ts";
import { routes } from "./routes.tsx";

/** HTML を作るページのパス（トップ・各グループのタブ・全曲・全イベント） */
export async function paths(): Promise<string[]> {
  const out = ["/", "/privacy"];
  if (__EDITOR__) out.push("/invite");
  for (const artist of artists) {
    const base = `/${artist.id}`;
    const data = await loadArtistData(artist);
    out.push(`${base}/songs`, `${base}/events`, `${base}/trends`, `${base}/members`, `${base}/attendance`);
    // 入力画面の一覧（プレビュー版だけ。各イベントの入力画面はブラウザで描く）
    if (__EDITOR__) out.push(`${base}/edit`);
    out.push(...data.songs.map((s) => `${base}/songs/${s.id}`));
    out.push(...data.events.map((e) => `${base}/events/${e.id}`));
  }
  return out;
}

/**
 * path のページの #root の中身。ルーターの引き継ぎ用の <script>（window.__staticRouterHydrationData）を含む。
 * データの読み込み（use()）が終わるまで待ってから描く
 */
export async function render(path: string): Promise<string> {
  // データを先に読み込んでおく（use() が待たずに値を返す）。描画中に待つと、React は読み込み中の形を出して
  // 中身を隠し場所に置き、スクリプトで入れ替える形の HTML にしてしまう（JS が無いと中身が見えない）
  await Promise.all(artists.map(loadArtistData));
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(new URL(path, "http://localhost")));
  if (context instanceof Response) throw new Error(`${path}: リダイレクトになるページは HTML を作れない（${context.status}）`);
  const router = createStaticRouter(handler.dataRoutes, context);
  const { prelude } = await prerender(
    <StrictMode>
      <StaticRouterProvider router={router} context={context} />
    </StrictMode>,
    // 大きなページでも、中身を読み込み中の形の後ろに隠してスクリプトで入れ替える形（分割して先に送るための工夫）にしない。
    // ファイルとして丸ごと置くので、最初から中身が正しい位置にある HTML にする（JS が無くても読める）
    { progressiveChunkSize: Number.POSITIVE_INFINITY },
  );
  return new Response(prelude).text();
}
