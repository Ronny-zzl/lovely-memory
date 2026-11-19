/*
 * Cloudflare Pages の _worker.js（advanced mode）の入口。
 * _routes.json で /api/* だけがここに来る。それ以外は静的ファイルとして配信される。
 */
import { handleApi, type ApiEnv } from "./api.ts";

type Env = ApiEnv & { ASSETS: { fetch(request: Request): Promise<Response> } };

/**
 * /assets/ のファイル（名前に内容のハッシュ入り。1 年キャッシュさせる）が無いとき、Pages は SPA としてトップの HTML を
 * 200 で返してしまう。デプロイの切り替わりの瞬間などにそれが CDN に 1 年キャッシュされると、その JS を読むページが真っ白になる
 * （2026-11-19 に実際に起きた）。HTML が返ってきたら 404 にして、キャッシュさせない。
 */
export async function serveAsset(request: Request, assets: Env["ASSETS"]): Promise<Response> {
  const res = await assets.fetch(request);
  if (!res.headers.get("content-type")?.includes("text/html")) return res;
  return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/assets/")) return serveAsset(request, env.ASSETS);
    return (await handleApi(request, env)) ?? env.ASSETS.fetch(request);
  },
};
