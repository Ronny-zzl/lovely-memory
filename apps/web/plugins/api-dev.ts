import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { handleApi } from "../worker/api.ts";

/** 開発サーバー・プレビューで /api/* を Worker と同じ関数で処理する */
export function apiDev(): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    if (!req.url?.startsWith("/api/")) return next();
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const chunks: Buffer[] = [];
    if (req.method === "POST") for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const response = await handleApi(new Request(url, { method: req.method, headers, body }));
    if (!response) return next();
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
  // 例外は Vite に渡してエラーとして返す（握りつぶすとリクエストが返らないまま止まる）
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    // oxlint-disable-next-line promise/no-callback-in-promise -- Connect のミドルウェアは next(err) でエラーを渡す決まり
    handle(req, res, next).catch(next);
  };
  return {
    name: "lovely-memory:api-dev",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
