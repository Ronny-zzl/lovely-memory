import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { handleApi } from "../worker/api.ts";

/** 開発サーバー・プレビューで /api/* を Worker と同じ関数で処理する */
export function apiDev(): Plugin {
  const middleware: Connect.NextHandleFunction = async (req: IncomingMessage, res: ServerResponse, next) => {
    if (!req.url?.startsWith("/api/")) return next();
    const response = await handleApi(new Request(new URL(req.url, `http://${req.headers.host ?? "localhost"}`), { method: req.method }));
    if (!response) return next();
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
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
