# 日常维护

## 自动完成的部分

| 时间 | 内容 | Workflow |
|---|---|---|
| 每天 05:00 JST | 从 eventernote 同步活动（开演 30 天以内与未来的活动） | `sync.yml` |
| 每月 2 日 04:00 JST | 全量同步 | `sync.yml` |
| 有待处理公演时每 15 分钟 | 读取官方 X 的歌单推文并自动导入（见下文「从 X 自动导入」） | `watch-x.yml` |
| 同步之后 | 为**当天**的每场演出开一个「[セトリ] …」Issue（指派给仓库所有者；过去 7 天内漏开的也会补开） | `sync.yml` |
| 随时（Renovate） | 依赖更新 PR。CI（类型检查・测试・数据检查・构建・冒烟测试〔用 Chrome 打开全部页面〕）通过后自动合并；npm 包发布满 3 天才会更新，lockfile 每周一整理 | `renovate.json` / `ci.yml` |
| 同步・歌单导入・push 之后 | 先跑和 CI 相同的检查（再加上对最终产物的冒烟测试），全部通过才部署到 Cloudflare Pages（https://lovely-memory.moe/）；有一项失败就不部署，网站保持上一个版本 | `deploy.yml` |

## 录入歌单

1. 活动当天会收到 Issue 通知
2. 把官方的歌单推文**正文**作为评论贴到 Issue（推文 URL 也一起贴会记为出处）
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

- 每 15 分钟（10:00〜翌 02:45 JST）检查一次。只有存在「已开演、开演后 8 小时以内、还没有歌单」的公演时才调用 X API（`pnpm lm watch-x`），否则不读取，也不产生费用
- 读取官方账号（`artist.json` 的 `sources.x`）的新推文，用和批量导入相同的规则匹配公演。只处理带「セトリ」等字样的告知，找到后立即导入；之后若有续推（编号接续、20 分钟以内），合并后重新导入并再次回复
- 曲目全部能对上 → 自动提交，在 Issue 中回复后关闭；有对不上的曲名，或无法确定是哪场公演 → 只在 Issue 中报告，按上面的手动流程处理
- **不会覆盖已有的歌单**（手动导入优先）；唯一例外是自动导入后没被改动过的歌单（为了接上续推）。手动修改过之后，该公演就不再读取 X。自动导入的结果有误时，在 Issue 中评论正确内容即可覆盖
- 读过的推文保存在 Actions 的缓存中（`x-state-*`），同一条推文不会重复读取。缓存丢失时从待处理公演中最早的开演时间重新读取
- 启用步骤（2026-11-19 已完成）：
  1. 在 X 开发者平台创建 App，充值少量额度（按量计费）
  2. 在仓库 Settings → Secrets and variables → Actions 中添加 secret `X_BEARER_TOKEN`
  3. 在 Actions 页面手动运行 Watch X，勾选 dry run（只读取，不写入、不提交、不回复），`now` 填过去某场公演结束后的时刻（如 `2026-11-18T22:30+09:00`），确认能读到那场的歌单推文
  4. 取消 `watch-x.yml` 中 `schedule` 的注释，开始定时执行

## 手动操作

```sh
# 单场录入（本地）
pbpaste | pnpm lm add-setlist taiyotsukiyo-2nd --date 2026-11-18 --source <推文URL>

# 活动类型・出演成员的修正
#   artists/<id>/overrides.json 的 "events": { "<eventId>": { "types": [...], "members": [...] } }

# 翻唱曲・未发行曲
pnpm lm add-song taiyotsukiyo-2nd --title "曲名" --cover "原唱"

# 衣装：artist.json 的 costumes 里登记。没有单独指定的公演，自动算作「当时最新的常规衣装」（since 最晚且不晚于公演日、不是 special 的那件）
#   换了新的常规衣装：在 costumes 加一行 { "id": "...", "name": "…衣装", "since": "开始穿的日期" }
#   特别衣装（只在某些公演）：costumes 加 { "id": "...", "name": "…衣装", "special": true }，
#   再在 overrides.json 的 "events": { "<eventId>": { "costume": "<id>" } } 指定

# 动画主题曲等合作信息：在 songs.json 对应的曲目里加 tieups（列表上显示「アニメ」等标签）
#   "tieups": [{ "type": "anime", "work": "作品名", "role": "オープニングテーマ", "url": "官网" }]
#   type: anime / drama / movie / game / cm / other

# 数据检查（也列出还没有歌单的已结束活动）
pnpm lm validate all --missing

# 线上浏览器报的错误（同一错误合并，按次数排序；需要 wrangler login）
pnpm lm errors all --days 7

# 改了 D1 的表结构：在 apps/web/migrations/ 加一个新的 .sql，然后
pnpm --filter @lovely-memory/web exec wrangler d1 migrations apply lovely-memory --remote
```
