/*
 * Cloudflare Pages の _worker.js（advanced mode）の入口。
 * _routes.json で /api/* だけがここに来る。それ以外は静的ファイルとして配信される。
 */
import { handleApi } from "./api.ts";

type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await handleApi(request)) ?? env.ASSETS.fetch(request);
  },
};
