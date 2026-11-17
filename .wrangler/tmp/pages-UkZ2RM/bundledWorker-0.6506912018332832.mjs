var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// _worker.js
var g = "https://www.eventernote.com";
var f = /^[A-Za-z0-9_-]{1,40}$/;
function A(t, e = 1) {
  return `${g}/users/${encodeURIComponent(t)}/events${e > 1 ? `?page=${e}` : ""}`;
}
__name(A, "A");
function v(t) {
  let e = t.indexOf("gb_event_list"), n = e >= 0 ? t.slice(e) : t, a = [];
  for (let r of n.split('<div class="date">').slice(1)) {
    let s = r.match(/(\d{4}-\d{2}-\d{2})/)?.[1], o = r.match(/href="\/events\/(\d+)"/)?.[1];
    s && o && a.push({ id: Number(o), date: s });
  }
  let c = /<li class=["']?next["']?>\s*<a /.test(t);
  return { events: a, hasNext: c };
}
__name(v, "v");
var i = class extends Error {
  static {
    __name(this, "i");
  }
  status;
  constructor(e, n) {
    super(n), this.status = e;
  }
};
async function l(t, e) {
  if (!f.test(t)) throw new i("invalid", "\u30E6\u30FC\u30B6\u30FC\u540D\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093");
  let n = e.fetch ?? fetch, a = e.maxPages ?? 10, c = [];
  for (let r = 1; r <= a; r++) {
    r > 1 && e.delayMs && await new Promise((u) => setTimeout(u, e.delayMs));
    let s = await n(A(t, r), { headers: e.userAgent ? { "user-agent": e.userAgent } : void 0, redirect: "follow" });
    if (s.status === 404) throw new i("not-found", `eventernote \u306B\u30E6\u30FC\u30B6\u30FC\u300C${t}\u300D\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
    if (!s.ok) throw new i("upstream", `eventernote \u304B\u3089\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\uFF08HTTP ${s.status}\uFF09`);
    let { events: o, hasNext: p } = v(await s.text());
    c.push(...o.filter((u) => u.date >= e.since));
    let m = o.some((u) => u.date < e.since);
    if (!p || m || o.length === 0) return { events: c, pages: r, truncated: false };
  }
  return { events: c, pages: a, truncated: true };
}
__name(l, "l");
var w = "Mozilla/5.0 (compatible; lovely-memory-bot/0.1; setlist statistics)";
var E = 600;
var d = /* @__PURE__ */ __name((t, e = 200, n = 0) => new Response(JSON.stringify(t), { status: e, headers: { "content-type": "application/json; charset=utf-8", "cache-control": n ? `public, max-age=${n}` : "no-store" } }), "d");
async function x(t, e) {
  let n = new URL(t.url).searchParams.get("since") ?? "";
  if (!f.test(e)) return d({ error: "\u30E6\u30FC\u30B6\u30FC\u540D\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return d({ error: "since\uFF08YYYY-MM-DD\uFF09\u304C\u5FC5\u8981\u3067\u3059" }, 400);
  let a = globalThis.caches?.default, c = new Request(new URL(`/api/eventernote/${e.toLowerCase()}?since=${n}`, t.url).toString()), r = await a?.match(c);
  if (r) return r;
  try {
    let s = await l(e, { since: n, userAgent: w, maxPages: 10, delayMs: 500 }), o = d({ user: e, ...s }, 200, E);
    return await a?.put(c, o.clone()), o;
  } catch (s) {
    return s instanceof i ? d({ error: s.message }, s.status === "invalid" ? 400 : s.status === "not-found" ? 404 : 502) : d({ error: "\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F" }, 502);
  }
}
__name(x, "x");
async function h(t) {
  let e = new URL(t.url);
  if (!e.pathname.startsWith("/api/")) return;
  if (t.method !== "GET") return d({ error: "method not allowed" }, 405);
  let n = e.pathname.match(/^\/api\/eventernote\/([^/]+)\/?$/);
  return n ? x(t, decodeURIComponent(n[1])) : d({ error: "not found" }, 404);
}
__name(h, "h");
var b = { async fetch(t, e) {
  return await h(t) ?? e.ASSETS.fetch(t);
} };

// ../../../../../../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../../../.wrangler/tmp/bundle-hQIsob/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = b;

// ../../../../../../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../../../.wrangler/tmp/bundle-hQIsob/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=bundledWorker-0.6506912018332832.mjs.map
