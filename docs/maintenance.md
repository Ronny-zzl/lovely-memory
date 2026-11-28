# 日常维护

## 自动完成的部分

| 时间 | 内容 | Workflow |
|---|---|---|
| 每天 05:00 JST | 从 eventernote 同步活动（开演 30 天以内与未来的活动） | `sync.yml` |
| 每月 2 日 04:00 JST | 全量同步 | `sync.yml` |
| 官方发推时（Webhook）＋每小时 | 读取官方 X 的歌单推文并自动导入（见下文「从 X 自动导入」） | `watch-x.yml` |
| 同步之后 | 为**当天**的每场演出开一个「[セトリ] …」Issue（指派给仓库所有者；过去 7 天内漏开的也会补开） | `sync.yml` |
| 随时（Renovate） | 依赖更新 PR。CI（类型检查・测试・数据检查・构建・冒烟测试〔用 Chrome 打开全部页面〕）通过后自动合并；npm 包发布满 3 天才会更新，lockfile 每周一整理 | `renovate.json` / `ci.yml` |
| 同步・歌单导入・push 之后 | 先跑和 CI 相同的检查（再加上对最终产物的冒烟测试），全部通过才部署到 Cloudflare Pages（https://lovely-memory.moe/）；有一项失败就不部署，网站保持上一个版本 | `deploy.yml` |

## 录入歌单

1. 活动当天会收到 Issue 通知
2. 把官方的歌单推文**正文**作为评论贴到 Issue（推文 URL 也一起贴会记为出处）。**只贴推文 URL 也可以**：会用 X API 读取正文（官方账号的推文还会合并 20 分钟内的续推）
3. 自动导入、提交、部署，并回复结果后关闭 Issue

评论中可以用的指令（单独一行）：

| 指令 | 作用 |
|---|---|
| `/add-unknown` | songs.json 中没有的曲名作为新曲登记 |
| `/skip` | 没有歌单・活动中止等，直接关闭 Issue |

- 失败时（曲名对不上等）会回复原因，Issue 保持打开。修正后重新评论即可
- 已关闭的 Issue 再评论一次会**覆盖**该活动的歌单（用于修正）
- 只处理仓库所有者的评论；没有歌单格式的普通评论会被忽略

### 从 X 自动导入（`watch-x.yml`）

**触发方式**
- **Webhook（主要）**：从开演前 24 小时到歌单确定（最晚到第二天凌晨 2:00 JST；开演很晚的公演至少开演后 4 小时）为止，订阅官方账号的发推事件（X Activity API 的 `post.create`）。官方发推后，X 把推文推送到 `https://lovely-memory.moe/api/x-webhook`。Worker 校验签名后，如果是歌单类推文（含「セトリ」等字样，或以 `M数字` 开头的续推），就立刻启动 `watch-x.yml`。收到的推送都记在 D1 的 `x_events` 表（保留 30 天）
- **每小时巡检（兜底）**：开关订阅；Webhook 没送到时也会把歌单捡回来。GitHub 的 schedule 实际可能好几个小时才跑一次，所以订阅提前 24 小时打开，而不是等开演后的那次巡检（2026-11-21 就是开演 7 小时后才打开，错过了歌单推文）
- 订阅期间官方发的每条推文都按「读取一条推文」计费；订阅关闭期间不产生费用

**导入规则**
- 只有存在「已开演、还没到第二天凌晨 2:00、歌单未确定」的公演时才调用 X API（`pnpm lm watch-x`），用 `since_id` 只读新推文
- 用和批量导入相同的规则匹配公演。只处理带「セトリ」等字样的告知，找到后立即导入；之后若有续推（编号接续、20 分钟以内），合并后重新导入并再次回复
- 曲目全部能对上 → 自动提交并启动 Deploy（bot 的 push 不会触发部署，所以由 `watch-x.yml` 用 `gh workflow run` 启动），在 Issue 中回复后关闭；有对不上的曲名，或无法确定是哪场公演 → 只在 Issue 中报告，按上面的手动流程处理
- **不会覆盖已有的歌单**（手动导入优先）；唯一例外是自动导入后没被改动过的歌单（为了接上续推）。手动修改过之后，该公演就不再读取 X
- 读过的推文保存在 Actions 的缓存中（`x-state-*`），同一条推文不会重复读取。缓存丢失时从待处理公演中最早的开演时间重新读取

**需要的设置**

| 放在哪里 | 名称 | 内容 |
|---|---|---|
| GitHub Actions secret | `X_BEARER_TOKEN` | X App 的 Bearer Token（读推文、管理 Webhook 和订阅） |
| GitHub Actions variable | `X_WEBHOOK_ID` | `pnpm lm x-webhook register` 输出的 id。没有设置时只靠每小时巡检 |
| Cloudflare Pages secret | `X_WEBHOOK_SECRET` | X App 的 OAuth 2.0 Client Secret（CRC 和签名校验） |
| Cloudflare Pages secret | `GITHUB_DISPATCH_TOKEN` | GitHub fine-grained token：只选本仓库，权限只开 Actions: Read and write |

Cloudflare 的 secret 用 `pnpm --filter @lovely-memory/web exec wrangler pages secret put <名称> --project-name lovely-memory` 设置，**下一次部署后生效**。

**Webhook 的注册与排查**

```sh
export X_BEARER_TOKEN=...   # 只在自己的终端里
pnpm lm x-webhook register --url https://lovely-memory.moe/api/x-webhook   # 一次性。X 会立刻做 CRC 校验
pnpm lm x-webhook list                    # Webhook 是否有效、当前的订阅
pnpm lm x-webhook revalidate --id <id>    # Webhook 变成无效时重新做 CRC

# 收到的推送
pnpm --filter @lovely-memory/web exec wrangler d1 execute lovely-memory --remote \
  --command "SELECT at, event_type, post_id, dispatched, substr(text, 1, 40) FROM x_events ORDER BY at DESC LIMIT 20"
```

## 下书き（非公开）的团体：预览版

记录还不完整、暂不公开的团体，在 `artist.json` 里设 `"draft": true`（例：`miline-hearts`）。

- **正式版**（https://lovely-memory.moe/）的构建完全不包含它：页面、数据、分享图、sitemap 都没有。也不会为它开歌单 Issue
- **预览版**：`deploy.yml` 的 `preview` 任务和正式版的 `production` 任务同时进行（各自跑全部检查）。`production` 先读正式站的 `version.json`（部署时写出的 commit），如果之后的改动只有草稿团体的数据（`pnpm lm site-changes`），就跳过正式站的构建和部署；手动触发（workflow_dispatch）时总是部署。预览版用 `INCLUDE_DRAFTS=1` 构建（包括分享卡片 `og-pages` 和 smoke；卡片缓存键用 `draft-og-`，没有时从正式版的 `og-` 缓存开始），部署到 Cloudflare Pages 的 `draft` 分支 → **https://draft.lovely-memory.pages.dev**。首页上草稿团体排在后面，带「下書き（非公開）」标签
- 本地：`INCLUDE_DRAFTS=1 pnpm build`，或 `INCLUDE_DRAFTS=1 pnpm --filter @lovely-memory/web dev`
- 数据本身在公开仓库里（`artists/<id>/`），所以「非公开」的意思是「不在网站上公开」
- 公开时：删掉 `draft`，正常部署即可

### 录入界面（只在预览版）

没有官方歌单告知的团体，在预览版上手动录入：页头的「入力」标签 → 已举行活动的一览（未入力／一部だけ／曲順不明／入力済み）→ 选活动。

- 点曲目的标签按顺序加入；用搜索框找（别名也行）；找不到时可以「＋ 新しい曲として追加」；想不起来的曲用「？」
- 每首曲：↑↓ 调顺序・EN（安可）・「…」写备注、选只有部分成员唱的成员・✕ 删除
- 「ステージを分ける」可以分多个舞台（2 部制・别舞台等）；有多个舞台时，用「ここに追加」选择点曲目时加到哪个舞台。舞台勾选「コラボ」= 和其他团体的コラボステージ（`collab: true`），这时每首曲的「…」里可以写一起唱的人（`with`，用「、」分隔）。新加的舞台会插在末尾的コラボステージ前面
- 记录的完整度：全部齐全／只有一部分（`completeness: partial`）／曲目齐全但顺序不明（`unordered`）。不完整的歌单计入歌唱次数・歌唱率，但不用于 1 曲目・ラスト・衔接（「?」也一样）
- 输入途中会自动存在浏览器里，下次打开可以「続きから」
- 保存：`POST /api/edit`（Worker 验证 Access 的签名令牌 `Cf-Access-Jwt-Assertion`；没有令牌的请求，比如对正式版的直接请求，一律拒绝）→ 启动 `apply-edit.yml`（`workflow_dispatch`）→ `pnpm lm apply-edit` 校验（曲名统一成 songs.json 的正式写法、新曲加进 songs.json）后提交 → Deploy 重新部署正式版和预览版。数分钟后反映
- 保存后界面显示上线进度：Worker 返回受理时间，界面每 5 秒读一次 `/version.json`，出现受理时间之后的 commit 的部署就显示「反映されました」。5 分钟还没上线会提示去看 Actions（apply-edit・Deploy）
- 已入力的歌单也可以从同一界面修改（公演详情页的「セトリを直す」）
- 曲的信息（作词・作曲・编曲、发行、原曲、タイアップ、别名、备注）：曲页面的「曲の情報を直す」（`/:artist/songs/:songId/edit`）。保存走同一条路（`/api/edit` → `apply-edit.yml`），整项替换，空了就删。曲名・区分・ユニット・视频不在这里改（曲名关系到歌单的匹配，用 `pnpm lm song --rename`）
- 需要：预览环境的 secret `GITHUB_DISPATCH_TOKEN`（`wrangler pages secret put GITHUB_DISPATCH_TOKEN --project-name lovely-memory --env preview`，和正式环境用同一个 token），`wrangler.toml` 的 `ACCESS_TEAM_DOMAIN`・`ACCESS_AUD`

**预览版的访问保护（Cloudflare Access）**：Cloudflare 后台 → Workers & Pages → `lovely-memory` → Settings → General → 「Access policy」里对预览部署启用 → 在 Zero Trust 里把策略改成只允许自己的邮箱。正式版（`main`）不受影响。
- 登录方式：Google。Zero Trust「集成 → 身份提供程序」添加 Google（Google Cloud 的 OAuth 客户端，类型 Web application，重定向 URI 填 `https://lovely-memory-pages.cloudflareaccess.com/cdn-cgi/access/callback`），应用的「登录方法」只选 Google 并打开「应用即时身份验证」（直接跳到谷歌登录）。Worker 只验证 Access 的令牌，和登录方式无关，换登录方式不用改代码
- 退出登录：打开 `https://draft.lovely-memory.pages.dev/cdn-cgi/access/logout`
- Google Cloud 的 OAuth 应用要「发布」（In production）：处于 Testing 时只有 Test users 能登录
- 邀请别人：预览版的 `/invite`（录入一览页有链接，只有管理者能用）。输入对方的谷歌邮箱 →「招待する」→ 把生成的文字发给对方。「外す」会把人从名单去掉并立刻结束对方的登录。被邀请的人和管理者一样能录入、保存歌单
  - 原理：被邀请的人放在 Zero Trust 的「访问组」（Access groups）里，应用的 Allow 策略包含这个组；`/api/access`（`worker/access.ts`）验证 Access 令牌、确认是管理者后，用 Cloudflare API 读写这个组的邮箱列表。管理者自己的邮箱直接写在策略里（不放进组，免得在页面上把自己删掉）
  - 需要：预览环境的 secret（`wrangler pages secret put <名字> --project-name lovely-memory --env preview`）：`ACCESS_ADMIN_EMAILS`（管理者邮箱，逗号分隔）、`CF_API_TOKEN`（自定义令牌，权限只给 Account → 「Access: Organizations, Identity Providers, and Groups」Edit）、`CF_ACCOUNT_ID`、`ACCESS_GROUP_ID`（访问组的 ID）。都不写进仓库

## 手动操作

```sh
# 单场录入（本地）
pbpaste | pnpm lm add-setlist taiyotsukiyo-2nd --date 2026-11-18 --source <推文URL>

# 活动类型・出演成员的修正
#   artists/<id>/overrides.json 的 "events": { "<eventId>": { "types": [...], "members": [...] } }

# 翻唱曲・未发行曲
pnpm lm song taiyotsukiyo-2nd "曲名" --new --cover "原唱"

# 已登记的曲：补・改信息（作词作曲、发行、原曲、タイアップ 等）。先加 --dry-run 看会改什么
pnpm lm song miline-hearts 初恋の合図 --credits "編曲：桑田健吾" --release-date 2026-07-11 --release-title 初恋の合図 --release-kind digital
pnpm lm song miline-hearts しゅがぴゅあ --cover-release-date 2026-04-14 --tieup "anime|ネコのクラちゃん|オープニングテーマ"
pnpm lm song miline-hearts 初恋の合図 --unset credits.arrangement

# 衣装：artist.json 的 costumes 里登记。没有单独指定的公演，自动算作「当时最新的常规衣装」（since 最晚且不晚于公演日、不是 special 的那件）
#   换了新的常规衣装：在 costumes 加一行 { "id": "...", "name": "…衣装", "since": "开始穿的日期" }
#   特别衣装（只在某些公演）：costumes 加 { "id": "...", "name": "…衣装", "special": true }，
#   再在 overrides.json 的 "events": { "<eventId>": { "costume": "<id>" } } 指定

# 动画主题曲等合作信息：在 songs.json 对应的曲目里加 tieups（列表上显示「アニメ」等标签）
#   "tieups": [{ "type": "anime", "work": "作品名", "role": "オープニングテーマ", "url": "官网" }]
#   type: anime / drama / movie / game / cm / other

# 曲页面的视频：官方 YouTube 出了新的 MV・ライブ映像・Dance Practice・歌割動画后
#   用 yt-dlp 读频道的「動画」页（没装的话用 uvx yt-dlp，需要 uv），只追加还没登记的视频
#   显示「? 曲が決まりません」的是 songs.json 里没有的曲：先 `pnpm lm song <团体> <曲名> --new`，再运行一次
pnpm lm import-youtube taiyotsukiyo-2nd --dry-run
pnpm lm import-youtube taiyotsukiyo-2nd

# 数据检查（也列出还没有歌单的已结束活动）
pnpm lm validate all --missing

# 线上浏览器报的错误（同一错误合并，按次数排序；需要 wrangler login）
pnpm lm errors all --days 7

# 访问情况（Cloudflare Web Analytics）：每天的访问・热门页面・来源・设备・Core Web Vitals
#   需要环境变量 CLOUDFLARE_ANALYTICS_TOKEN（见下面「访问统计的令牌」）。--days 最大 31
pnpm lm analytics all --days 14

# 改了 D1 的表结构：在 apps/web/migrations/ 加一个新的 .sql，然后
pnpm --filter @lovely-memory/web exec wrangler d1 migrations apply lovely-memory --remote
```

### 访问统计的令牌

`pnpm lm analytics` 用一个只能读访问统计的 Cloudflare API 令牌（泄露了也改不了任何东西）。

1. https://dash.cloudflare.com/profile/api-tokens →「Create Token」→ 最下面「Create Custom Token」的「Get started」。
2. Permissions 只要一行：「Account」「Account Analytics」「Read」。Account Resources：「Include」+ 网站所在的账号（`packages/cli/src/repo.ts` 的 `CLOUDFLARE_ACCOUNT_ID`）。TTL 可以设一年左右。
3. 创建后令牌只显示一次。在 PowerShell 里存成用户环境变量：
   `[Environment]::SetEnvironmentVariable("CLOUDFLARE_ANALYTICS_TOKEN", "<令牌>", "User")`
4. **完全退出 VS Code（所有窗口）再打开**，新的环境变量才会生效（只重新加载窗口不行）。

- 变量名不要用 `CLOUDFLARE_API_TOKEN`：wrangler 会改用它，`pnpm lm errors`・部署相关的命令就用不了了。
- 不要写进任何文件。泄露了在同一页面「Roll」或「Delete」即可作废。
- 数字是 Cloudflare 抽样后的估计值（少的时候是 10 的倍数）。已排除 Cloudflare 判定为机器人的访问，但 Googlebot 这类会渲染页面的爬虫还会混进来（美国・只看 1 页・Android 或 Linux 的 Chrome 的访问基本是它们）。
