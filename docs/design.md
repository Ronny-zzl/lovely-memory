# ラブリィメモリー 设计文档

网站名「ラブリィメモリー」取自二期曲「ラブリィフェリス」。显示上统一使用日文表记；仓库名・URL・包名等程序标识仍为 `lovely-memory`。

「太陽と踊れ月夜に唄え」二期生（2026-09-04 出道）的歌单统计 Web 应用。纯前端，静态部署。

## 1. 范围

- **统计对象**：2026-09-04 及以后、eventernote 出演者中包含本组合（actor 72524）的所有活动，包括拼盘、外部 fes、发售活动。
- 2026-04-29 以前的一期时代活动不收录（eventernote 上同一 actor 页面里也有，需要按日期过滤）。
- **曲目**：一期的全部曲目，加上二期新曲。

## 2. 数据来源

| 数据 | 来源 | 方式 |
|---|---|---|
| 活动（日期・标题・场馆・时间・出演者） | eventernote | `pnpm lm sync all`，GitHub Actions 每日 05:00 JST 同步并直接 commit 到 main |
| 活动修正（漏登、改错、活动类型） | 人工 | `artists/<id>/overrides.json`，优先级高于同步结果 |
| 歌单 | 官方 X（Twitter）发布的推文 | 人工粘贴推文 → 脚本解析成 yaml |
| 曲目列表・制作人员 | 官网 Discography | `pnpm lm import-official`，官网为准（覆盖） |
| 曲目列表（补充） | ja.wikipedia | `pnpm lm import-wikipedia`，只补空字段（维基没有更新二期的信息） |
| 翻唱曲・未发行曲 | 人工 | `pnpm lm add-song --title … [--cover 原唱]` |

### eventernote 抓取说明（实测，2026-11-17）

- 列表 URL：`https://www.eventernote.com/actors/72524/events?actor_id=72524&limit=20&page=N`，按新到旧排列，每页 20 条（截至 2026-11-17 共 410 条）。
- HTML 结构：`.gb_event_list > ul > li` 对应一场活动
  - `.date p[class^=day]` → `2026-12-27 (日)`
  - `.event h4 a[href=/events/<id>]` → 标题和 ID
  - `.event .place a[href=/places/<id>]` → 场馆
  - `.event .place span.s` → `開場 hh:mm 開演 hh:mm 終演 hh:mm`（可能没有）
  - `.actor li a[href=/actors/<name>/<id>]` → 出演者
  - `.note_count p` → 参加者数（不使用）
- **只写 `Mozilla/5.0` 的 User-Agent 会返回 403。** 需要用带说明的 UA，例如 `Mozilla/5.0 (compatible; lovely-memory-sync; +<repo URL>)`。
- 礼貌规则：每次请求间隔 ≥3 秒。从新到旧翻页，遇到早于截止日的活动就停止。
- **增量同步**：开演日超过 30 天的活动视为确定，不再重新抓取（日常只需 1～2 页）。每月 2 日 04:00 JST 全量同步一次（`--full`），以免漏掉事后补登的活动。
- 1部・2部在 eventernote 上本来就是两场独立的活动。
- robots.txt 只禁止 `/users/notice` 和 `/users/timeline`。

### 官网适配器

官网的 HTML 结构因艺人而异，所以以适配器形式实现：`packages/cli/src/sources/official/<adapter>.ts`，在 `artist.json` 的 `sources.official.adapter` 中指定。新艺人只需新增一个适配器（实现 `DiscographyAdapter`）。

### 曲目合并规则

- 用 `normalizeTitle` 照合曲名（含 `aliases`）。
- 收录作品取发售日最早的。
- era 由 `artist.json` 的 `eras[].since` 按发售日自动判定（翻唱曲用 `add-song --cover` 时默认为 `cover`）。

## 3. 数据模型

```ts
type Member = {
  id: string;            // "anne"
  name: string;          // "甘乃あんね"
  colorName: string;     // "ベビーピンク"
  color: string;         // "#F5B5C8"
  eventernoteId: number; // 94952
};

type Song = {
  id: string;            // slug
  title: string;         // 正式曲名
  aliases?: string[];    // 推文里出现的写法差异
  era: "1st" | "2nd";    // 一期曲 / 二期新曲
  originalUnit?: "太陽と踊れ" | "月夜に唄え" | "全体";
  release?: { date: string; title: string; type: "EP" | "single" | "digital" };
  credits?: { lyrics?: string; music?: string; arrangement?: string; raw?: string };
};

type EventType =
  | "oneman"     // 单独公演・出道Live・大感謝祭
  | "taiban"     // 主办对拼（日進月歩）
  | "external"   // 外部拼盘・fes
  | "release"    // 发售纪念活动（mini live）
  | "free"       // 免费 live
  | "tokuten";   // 只有切奇会等，没有演出 → 不计入歌单统计

type Event = {
  id: number;            // eventernote 的 event id
  date: string;          // "2026-09-04"
  title: string;
  venue?: { id: number; name: string };
  open?: string; start?: string; end?: string;
  performers: number[];  // eventernote 的 actor id
  types: EventType[];    // 可多个（如 单独公演+Free Live）。按 eventTypeRules 推断（命中的全部），overrides 的 types 整体替换
};

// artists/<id>/setlists/<eventId>.yaml（由 `pnpm lm add-setlist` 从推文生成）
type Setlist = {
  event: number;
  source?: string;       // 推文 URL
  // 二选一：单一舞台写 items，多舞台（fes 等）写 stages
  items?: SetlistItem[];
  stages?: Array<{ name?: string; members?: string[]; items: SetlistItem[] }>;
};
type SetlistItem = string | {
  song: string;          // 曲名（正式表记）
  members?: string[];    // 只在部分成员演唱时填写
  encore?: boolean;
  note?: string;         // short ver. / medley 等
};
```

成员是否出演，按以下规则判断：Setlist 项的 `members` → 舞台的 `members` → overrides → eventernote 的 performers。如果 eventernote 上 6 人一个都没登记，就当作全员出演。

**首唱不记录在数据里**，统计时取该曲最早出现的活动。推文里的「(新曲)」只表示是新歌，fes 等场合在首唱后仍会标注（例：10/4 クロフェス 的 ラブリィフェリス）。

### 翻唱曲与合作舞台

两者是独立的概念：

- **翻唱曲（cover）**：歌曲本身属于其他艺人。`songs.json` 中 `era: "cover"`，`cover: { artist, title?, release? }`（`release` 为原曲的发行信息）。组合自己演唱翻唱曲时（如 12/27 ユニットカバー公演）照常计入曲目统计。
- **合作舞台（collab）**：舞台形式。成员单独参加其他团体主办的企划舞台等。歌单中 `stages[].collab: true`，曲目可写 `members`（参加的成员）和 `with`（共演的其他团体出演者）。

| 统计 | 合作舞台 |
|---|---|
| 曲目统计页 | 默认不计入（开关「コラボステージを含む」）；只在合作舞台唱过的曲目在关闭时不显示 |

翻唱曲（`song.cover` 有值）演唱次数少、间隔长，因此不进入曲目统计表，而是在其下方「カバー曲」区以演出记录（日期列表，含合作舞台）展示；曲目详情页不显示演唱率・出现规律・位置统计；活动详情的歌单中标注「カバー（原曲: …）」。
| 活动详情・曲目详情 | 显示（「コラボ」标签、with） |
| 首唱判定 | 计入 |
| 成员统计 | 计入 |

### 推文解析规则（`parseSetlistText`）

- `M1_ 曲名` 形式的行为一曲，紧随其后的「作詞・作曲・編曲」行（可跨行）为其制作人员；`EN_` / `EN1_` / `WEN_` 为安可；单独一行的「アンコール」「-EN-」「【アンコール】」「🎵ENCORE🎵」等（去掉符号后只剩 EN / ENCORE / アンコール）之后、到下一部开始前的曲目也记为安可。形似曲目行但无法识别的行（如 `XX1_ 曲名`）原样当作曲名保留，导入时会作为「不明的曲」被发现，不会被悄悄丢掉。
- 安可的统计：回数・歌唱率・里程碑・参戦記録都计入；1 曲目・ラスト・前半〜后半只看本编（ラスト = 本编最后一首）；衔接和固定流程在本编内、安可内分别统计，本编ラスト → 安可第 1 首不算。显示编号：安可只有 1 首时为 EN，多首时为 EN1・EN2…；公演页在本编和安可之间加「アンコール」小标题。`pnpm lm validate` 会检查同一部里安可之后不能再有本编曲。
- 编号回到 M1 时开始新舞台，舞台名取之前最近的【…】；只有一个舞台时不设名字。
- 曲名末尾的括号标签：「(新曲)」忽略，其它（short ver. 等）记入 note。
- 推文中的制作人员只补 songs.json 的空字段，与官网不一致时只警告。

## 4. 成员

| id | 名字 | 颜色 | HEX（暂定） | eventernote |
|---|---|---|---|---|
| anne | 甘乃あんね | ベビーピンク | `#F5B5C8` | 94952 |
| hana | 日南波那 | 青 | `#2F6FDB` | 77864 |
| mei | 陽宮萌衣 | 赤 | `#E53935` | 94953 |
| myu | 水瀬みゅう | 水色 | `#5CC8F0` | 94954 |
| yui | 雅結葵 | ライトグリーン | `#8BD67A` | 94955 |
| orino | 夜凪織乃 | 紫 | `#8E5CC8` | 94956 |

## 5. 统计指标

- **曲目**：演唱次数（含同一活动不同舞台的重复）、演唱过的舞台数、演唱过的活动数、首唱日、最后演唱日、距上次演唱已经过了几场有演出的活动、按月和按年的次数、演唱率（有演出的场数中唱了这首歌的比例）
- **活动**：歌单、首唱曲、曲数
- **成员**：出演场数、演唱次数
- **矩阵**：横轴是活动，纵轴是曲目（相当于原表格的 セットリスト 视图）

计算对象只限有歌单的活动；按类型筛选时，活动的任一类型被选中即计入。演唱率的分母为该曲**首唱以后**（含首唱）的活动数。

## 6. 目录结构（pnpm monorepo）

为将来支持多个艺人，**逻辑与数据分离**：`packages/` 不含任何特定艺人的知识，艺人特有的东西（成员、活动类型判定规则、数据源 ID）全部放在 `artists/<id>/artist.json`。新增艺人 = 新建一个目录。

```
lovely-memory/
├─ packages/
│  ├─ core/          @lovely-memory/core   zod schema、类型、统计计算、歌单文本解析（纯函数，浏览器/Node 通用）
│  ├─ eventernote/   @lovely-memory/eventernote  eventernote 抓取与 HTML 解析
│  └─ cli/           @lovely-memory/cli    sync / import-wikipedia / add-setlist / validate 命令
├─ apps/
│  └─ web/           @lovely-memory/web    Vite + React，构建时用 import.meta.glob 读入 artists/*
├─ artists/
│  └─ taiyotsukiyo-2nd/
│     ├─ artist.json      配置（手写）
│     ├─ songs.json       曲目（导入后手动维护）
│     ├─ events.json      活动（自动同步生成，不手改）
│     ├─ overrides.json   活动修正（手写）
│     └─ setlists/<eventId>.yaml
└─ .github/workflows/  sync.yml（每日，遍历所有有 eventernote 配置的艺人）, deploy.yml（Cloudflare Pages）
```

- **浏览器端不带 zod**：`apps/web/plugins/artists-data.ts` 在构建时读取 `artists/`，用 zod 校验并补默认值后，以虚拟模块提供（每个艺人 1 个 chunk）。网页只从 `@lovely-memory/core/runtime`（不含 zod 的入口）导入。数据有误时构建失败。
- 内部包直接导出 TS 源码（`exports: ./src/index.ts`），无需构建。Node（≥24）直接运行 .ts（type stripping），不使用 tsx。
- 因此相对 import 必须带扩展名（`./schema.ts`），且只能使用可擦除的 TS 语法（tsconfig: `NodeNext` + `allowImportingTsExtensions` + `erasableSyntaxOnly` 在 typecheck 时强制）。
- 同一组合的不同期视为不同的 artist（通过 `since`/`until` 区分），共享 eventernote actor ID 也没问题。
- CLI 用法：`pnpm lm <command> <artistId>`。

## 7. 已知的出道 Live

- eventernote 486948「太陽と踊れ月夜に唄え Second Season Debut LIVE～ふたつの空の下で～」
- 2026-09-04，harevutai，開場 18:30，開演 19:00
- 全 16 首，其中新曲 3 首：未来絵 Go Around!!、LOVEが目印、ラブリィフェリス

## 部署

- **Cloudflare Pages**，项目名 `lovely-memory`，域名 **https://lovely-memory.moe/**（Porkbun 注册，nameserver 指向 Cloudflare）。`www.` 和 `lovely-memory.pages.dev` 由 Cloudflare 后台的规则 301 跳转到正式域名（`www`：域名的 Redirect Rule；`pages.dev`：账户的 Bulk Redirects，不含子域名，所以预览部署 `<hash>.lovely-memory.pages.dev` 不跳转）。页面里也有同样的跳转脚本作为后备（`site-meta.ts`），旧的 `/#/...` 链接也由页面转换。选择理由：网址不含个人账号名；将来可用 Pages Functions / D1 / KV 扩展（用户系统等）。
- GitHub Actions 在类型检查・测试・数据检查・构建・冒烟测试全部通过后，用 wrangler 上传（`deploy.yml`）。wrangler 是 `apps/web` 的 devDependency，版本由 lockfile 固定、Renovate 更新（不用 `npx wrangler@4`）。`ci.yml` 只在 PR 上运行。
- 代码检查：`pnpm lint`（oxlint，带类型信息的规则由 oxlint-tsgolint 提供，配置在 `.oxlintrc.json`），`pnpm format`（oxfmt，宽 140；`artists/` 数据、Markdown、CSS、HTML 不格式化，配置在 `.oxfmtrc.json`）。CI 和 deploy 都会检查这两项。异步的事件处理函数写成 `onClick={() => void f()}`。
- CSS：
  - `apps/web/src/styles/`：全站共用（`tokens.css` 的变量・`base.css`・头部 `layout.css`・多个页面共用的部件），由 `main.tsx` 统一引入。
  - 只属于某个页面或组件的样式放在它的 `.tsx` 旁边（如 `pages/SongStatsPage.css`），由该 `.tsx` 引入；Vite 会按懒加载的页面拆分 CSS，`preload-route` 插件会把当前页面的 CSS 也提前插入。
  - 颜色・字号・圆角・阴影只能用 `tokens.css` 里的变量；间距只用 0・2・4・6・8・10・12・16・20・24・32・64px。由 stylelint（`.stylelintrc.json`，`pnpm lint` 的一部分）检查。
  - 改动不应改变外观时，用 `pnpm visual shoot <目录>` 在改动前后各截一次图，再用 `pnpm visual compare <前> <后> <差异目录>` 逐像素比较（12 个页面 × 浅色/深色 × 手机/桌面）。
- 页面代码按路由懒加载（`main.tsx` 的 `lazy`）；首次打开时先加载当前页面的代码再渲染，切换页面时在新页面加载完成之前保持显示旧页面。需要仓库变量 `CLOUDFLARE_PROJECT`、secret `CLOUDFLARE_API_TOKEN`（「Edit Cloudflare Workers」模板）・`CLOUDFLARE_ACCOUNT_ID`。
- 普通路径路由（`createBrowserRouter`，路由表在 `src/routes.tsx`）。资源用绝对路径（`base: "/"`），网站必须放在域名根目录。
- **构建时预渲染**：`pnpm build` = ① `vite build`（浏览器用，`dist/`）② `vite build --ssr src/entry-server.tsx --outDir dist-ssr`（构建时渲染用）③ `scripts/prerender.ts`：用 React 的 `prerender`（`react-dom/static`）+ React Router 的 `createStaticHandler` 把全部页面（首页・各标签页・全曲・全公演，约 100 页）渲染成完整 HTML，写成 `dist/<path>.html`（首页是 `index.html`）。
  - HTML 的模板是 `dist/index.html`（`#root` 里是加载中的占位块）；替换 `#root` 里 `<!--app-->`〜`<!--/app-->` 之间的内容，`#root` 加上 `data-prerendered="<path>"`，并把该页面需要的 CSS・JS 直接写成 `<link>`（`preload-route` 插件输出的 `route-assets.json`，用完即删）。
  - 浏览器端（`main.tsx`）：`data-prerendered` 和当前路径一致时 `hydrateRoot` 接管，否则 `createRoot` 从头渲染（开发时、404 页、旧的 `/#/...` 链接等）。
  - 构建时没有的东西（今天的日期・参战记录・浏览器功能・网址参数）在接管的第一次渲染里也不用，接管后再重新渲染（`src/hydration.ts`）。手机／电脑的布局差异用 CSS（`.only-narrow`／`.only-wide`）切换，两种都输出。
  - 渲染前先读入全部数据，并关掉 React 的分段输出（`progressiveChunkSize`），保证内容直接写在 HTML 里（不开 JS 也能看）。
  - 有 `404.html` 所以 Cloudflare Pages 不再做 SPA 回退：不存在的路径返回 404（内容是占位块的壳，浏览器端渲染后跳到首页）。`/<artist>` 本身是壳 HTML（浏览器端跳到楽曲页）。离线时没缓存过的页面用 `shell.html`（同样是壳）。
- 旧的 hash 链接（`/#/...`，GitHub Pages 时代）在加载时转换为普通路径。
- 项目配置以 `apps/web/wrangler.toml` 为正本（`pages_build_output_dir` 使 `wrangler pages deploy` 采用它，后台不能再改这些项）。自定义域名、重定向规则等不在文件里的设置仍在后台。
- 前端错误上报：`src/error-report.ts` 收集 `window` 的错误、未处理的 Promise 错误和 React 渲染错误（`createRoot` 的 `onCaughtError`/`onUncaughtError`，以及路由的 `errorElement` = `RouteError`），用 `sendBeacon` 发到 `POST /api/errors`（`worker/errors.ts`）。Worker 只接受同源请求、单条 8KB 以内，写入 D1 数据库 `lovely-memory` 的 `client_errors` 表（`apps/web/migrations/`），约每 100 次写入顺带删除 90 天前的记录。Pages Functions 的日志不保存，所以存在 D1。只上报错误内容、页面路径、构建（commit 前 7 位）和 UA，不含参戦記録。每次打开页面最多 5 条，同一错误只报一次，浏览器扩展的错误和 `Script error.` 不报。冒烟测试会确认正常浏览时没有上报，以及页面代码加载失败时显示错误画面并上报。
- Issue 本文・回复中的网站链接来自仓库变量 `SITE_URL`。
- 分享卡片（OGP）：`apps/web/plugins/site-meta.ts` 在构建时写入 meta 标签，`og:image` 等绝对 URL 也取自 `SITE_URL`（`deploy.yml` 的构建步骤传入）。图片 `apps/web/public/og.png` 由 `tools/og/og.html` 生成：`tools/og/render.sh`（用本地 Google Chrome 截图，字体是 Google Fonts 的 M PLUS Rounded 1c）。
- 参战记录：保存在浏览器的 localStorage（`apps/web/src/attendance.ts`，键 `lovely-memory:attendance:v1`），手动勾选优先于 eventernote 导入。备份・引继（`attendance-backup.ts`）：JSON 文件，或 `LM1.` + base64url(JSON) 的引继码；导入时可「合并」（同一公演以导入为准，eventernote 连携保留现有的）或「替换」。分享图片（`attendance-card.ts`）：记录只在浏览器里，所以用 Canvas 在浏览器生成 1200×675 的 PNG（字体用 Google Fonts 的 `text=` 只取用到的字，离线时用系统字体）。手机（`pointer: coarse`）用系统分享菜单附带图片；电脑在生成后自动复制到剪贴板，点「ポスト」时也会先复制，再到 X 的投稿栏粘贴。eventernote 的参加活动通过站内 API `/api/eventernote/<用户名>?since=YYYY-MM-DD` 读取：Cloudflare Pages 的 `_worker.js`（`apps/web/worker/`，构建时用 esbuild 打包，`_routes.json` 只让 `/api/*` 进入 Worker），解析器是不依赖 cheerio 的 `@lovely-memory/eventernote/attended`。页面按新到旧排列，读到早于 since 的那一页就停（上限 10 页，间隔 0.5 秒），结果在边缘缓存 10 分钟；用户名不保存。开发・预览时同一个处理函数作为 Vite 中间件运行（`plugins/api-dev.ts`）。
- 访问统计：Cloudflare Web Analytics（在 Pages 项目的 Metrics 里开启，部署时由 Cloudflare 自动在 HTML 里插入 beacon 脚本，只对 `Accept: text/html` 的请求插入；数据 POST 到 `/cdn-cgi/rum`）。不用 Cookie。代码里没有相关设置。
- 添加到主屏幕（PWA）：`apps/web/public/manifest.webmanifest` + 图标 `apps/web/public/icons/`（由 `tools/icons/icon.html` 经 `tools/icons/render.sh` 生成，512px 兼作 maskable，图案在中央安全区内）。iOS 用 `apple-touch-icon`（180px）。离线：构建时生成 `sw.js`（`apps/web/plugins/service-worker.ts`）。页面优先联网、断网时用缓存（没缓存过的页面用壳 `shell.html` 在浏览器端渲染）；`/assets/`（带哈希）先查缓存，构建时全部预缓存，所以打开过一次就能离线看所有页面。缓存按版本分开，保留最近 2 个版本。分享卡片图片（`/og/`）不缓存。冒烟测试里有离线检查。
- 曲・公演页面的分享卡片：部署时 `pnpm lm og-pages all` 给每个页面的 `<path>.html`（预渲染好的 HTML；没有时用壳）写入 title・description・og:*，并生成 `og/<path>.png`（`packages/cli/src/og/cards.ts` 的 HTML 用 Chrome 截图，`playwright-core` + 系统 Chrome）。Cloudflare Pages 对 `/a/b` 返回 `a/b.html`（不加末尾斜杠）。列表页（楽曲・公演・傾向・メンバー）只换标题和说明，图片用全站通用的。此步骤失败也不影响部署（`continue-on-error`）。
