import { describe, expect, it } from "vitest";
import { serveAsset } from "./index.ts";

const assets = (body: string, type: string) => ({ fetch: async () => new Response(body, { headers: { "content-type": type } }) });

describe("serveAsset", () => {
  it("passes real asset files through", async () => {
    const res = await serveAsset(new Request("https://x/assets/a.js"), assets("export {}", "application/javascript"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("export {}");
  });

  it("turns the SPA fallback HTML for a missing asset into an uncacheable 404", async () => {
    const res = await serveAsset(new Request("https://x/assets/missing.js"), assets("<!doctype html>", "text/html; charset=utf-8"));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
