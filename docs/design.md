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

- `M1_ 曲名` 形式的行为一曲，紧随其后的「作詞・作曲・編曲」行（可跨行）为其制作人员；`EN_` / `EN1_` 为安可。
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

- **Cloudflare Pages**，项目名 `lovely-memory`，域名 **https://lovely-memory.moe/**（Porkbun 注册，nameserver 指向 Cloudflare）。`www.` 和 `lovely-memory.pages.dev` 在页面加载时跳转到正式域名（`site-meta.ts`；预览部署 `<hash>.lovely-memory.pages.dev` 不跳转）。选择理由：网址不含个人账号名；将来可用 Pages Functions / D1 / KV 扩展（用户系统等）。
- GitHub Actions 构建后用 wrangler 上传（`deploy.yml`）。需要仓库变量 `CLOUDFLARE_PROJECT`、secret `CLOUDFLARE_API_TOKEN`（「Edit Cloudflare Workers」模板）・`CLOUDFLARE_ACCOUNT_ID`。
- 普通路径路由（`createBrowserRouter`）。Cloudflare Pages 在没有 `404.html` 时，对不存在的路径返回 `index.html`（SPA 回退），所以直接打开或刷新 `/<artist>/songs/...` 也能显示。资源用绝对路径（`base: "/"`），网站必须放在域名根目录。
- 旧的 hash 链接（`/#/...`，GitHub Pages 时代）在加载时转换为普通路径。
- Issue 本文・回复中的网站链接来自仓库变量 `SITE_URL`。
- 分享卡片（OGP）：`apps/web/plugins/site-meta.ts` 在构建时写入 meta 标签，`og:image` 等绝对 URL 也取自 `SITE_URL`（`deploy.yml` 的构建步骤传入）。图片 `apps/web/public/og.png` 由 `tools/og/og.html` 生成：`tools/og/render.sh`（用本地 Google Chrome 截图，字体是 Google Fonts 的 M PLUS Rounded 1c）。
