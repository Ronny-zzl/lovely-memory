# lovely-memory 设计文档

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
- 礼貌规则：每天 1 次，每次请求间隔 ≥3 秒。从新到旧翻页，遇到早于 2026-09-04 的活动就停止。日常运行通常只需要 3～4 页。
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
  type: EventType;       // 先根据标题关键词推断，再用 overrides 修正
};

// data/setlists/<eventId>.yaml
type Setlist = {
  event: number;
  source?: string;       // 推文 URL
  items: Array<string | {
    song: string;        // 曲名或别名
    debut?: boolean;     // 首唱（推文里的「(新曲)」）
    members?: string[];  // 只在部分成员演唱时填写
    note?: string;       // short ver. / medley / encore 等
  }>;
};
```

成员是否出演，按以下规则判断：Setlist 项的 `members` → overrides → eventernote 的 performers。如果 eventernote 上 6 人一个都没登记，就当作全员出演。

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

- **曲目**：演唱次数、演唱过的场数、首唱日、最后演唱日、距上次演唱已经过了几场有演出的活动、按月和按年的次数、演唱率（有演出的场数中唱了这首歌的比例）
- **活动**：歌单、首唱曲、曲数
- **成员**：出演场数、演唱次数
- **矩阵**：横轴是活动，纵轴是曲目（相当于原表格的 セットリスト 视图）

计算对象只限有歌单的活动。`tokuten` 类型和还没录入歌单的活动不计入分母。

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
└─ .github/workflows/  sync.yml（每日，遍历所有有 eventernote 配置的艺人）, deploy.yml（GitHub Pages）
```

- 内部包直接导出 TS 源码（`exports: ./src/index.ts`），无需单独构建；Node 侧用 tsx 运行。
- 同一组合的不同期视为不同的 artist（通过 `since`/`until` 区分），共享 eventernote actor ID 也没问题。
- CLI 用法：`pnpm lm <command> <artistId>`。

## 7. 已知的出道 Live

- eventernote 486948「太陽と踊れ月夜に唄え Second Season Debut LIVE～ふたつの空の下で～」
- 2026-09-04，harevutai，開場 18:30，開演 19:00
- 全 16 首，其中新曲 3 首：未来絵 Go Around!!、LOVEが目印、ラブリィフェリス
