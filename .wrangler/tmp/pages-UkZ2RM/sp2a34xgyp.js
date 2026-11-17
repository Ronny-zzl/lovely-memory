// <define:__ROUTES__>
var define_ROUTES_default = {
  version: 1,
  include: [
    "/api/*"
  ],
  exclude: []
};

// ../../../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "/Users/zhangziliang/Documents/GitHub/lovely-memory/.wrangler/tmp/pages-UkZ2RM/bundledWorker-0.6506912018332832.mjs";
import { isRoutingRuleMatch } from "/Users/zhangziliang/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/pages-dev-util.ts";
export * from "/Users/zhangziliang/Documents/GitHub/lovely-memory/.wrangler/tmp/pages-UkZ2RM/bundledWorker-0.6506912018332832.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        const workerAsHandler = worker;
        if (workerAsHandler.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return workerAsHandler.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=sp2a34xgyp.js.map
