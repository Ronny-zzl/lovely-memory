# 日常维护

## 自动完成的部分

| 时间 | 内容 | Workflow |
|---|---|---|
| 每天 05:00 JST | 从 eventernote 同步活动（开演 30 天以内与未来的活动） | `sync.yml` |
| 每月 2 日 04:00 JST | 全量同步 | `sync.yml` |
| 同步之后 | 为**当天**的每场演出开一个「[セトリ] …」Issue（指派给仓库所有者；过去 7 天内漏开的也会补开） | `sync.yml` |
| 同步・歌单导入・push 之后 | 部署到 Cloudflare Pages（https://lovely-memory.pages.dev/） | `deploy.yml` |

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

## 手动操作

```sh
# 单场录入（本地）
pbpaste | pnpm lm add-setlist taiyotsukiyo-2nd --date 2026-11-18 --source <推文URL>

# 活动类型・出演成员的修正
#   artists/<id>/overrides.json 的 "events": { "<eventId>": { "types": [...], "members": [...] } }

# 翻唱曲・未发行曲
pnpm lm add-song taiyotsukiyo-2nd --title "曲名" --cover "原唱"

# 数据检查（也列出还没有歌单的已结束活动）
pnpm lm validate all --missing
```
