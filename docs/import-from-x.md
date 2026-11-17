# 从 X 批量导入歌单

初次补录历史歌单时使用。之后的日常维护用 `pnpm lm add-setlist` 单条录入即可。

## 1. 在浏览器中收集推文

1. 用已登录的浏览器打开 https://x.com
2. 打开开发者工具 → Console，粘贴 [tools/x-setlist-collector.js](../tools/x-setlist-collector.js) 的全部内容并回车
   - Chrome 第一次会拒绝粘贴，按提示输入 `allow pasting` 后再粘贴
3. 右下角出现面板后，点击「検索1」。页面跳转后**重新粘贴脚本**（已收集的数据保存在 localStorage，会自动恢复）
4. 点「▶ 自動スクロール」，滚动到底后会自动停止
5. 对「検索2」「検索3」重复 3〜4（搜索条件不同，覆盖不同写法；重复的推文会自动合并）
6. 面板上「本文が切れている」不为 0 时：在时间线上点击对应推文进入详情页，全文会被自动补上，然后用浏览器的「返回」回到列表
7. 点「JSON を保存」，下载 `tweets-taiyototsukiyo.json`

脚本只读取页面上已经显示的内容，不会向 X 发送额外请求。X 改版导致 DOM 结构（`data-testid`）变化时可能需要修改脚本。

## 2. 导入

```sh
pnpm lm import-setlists taiyotsukiyo-2nd --file ~/Downloads/tweets-taiyototsukiyo.json --dry-run   # 先确认
pnpm lm import-setlists taiyotsukiyo-2nd --file ~/Downloads/tweets-taiyototsukiyo.json
```

结果分为以下几类：

| 标记 | 含义 | 处理方法 |
|---|---|---|
| ✔ 登録 | 已写入 `setlists/<eventId>.yaml`（`source` 为推文 URL） | — |
| = 既に登録済み | 该活动已有歌单 | 需要覆盖时加 `--force` |
| ⚠ 本文が途中で切れている | 推文被折叠，正文不完整 | 回到第 1 步的 6，补全后重新导出 |
| ✗ songs.json に無い曲 | 曲名对不上 | 写法不同 → 在 songs.json 的 `aliases` 中添加；新曲・翻唱 → `pnpm lm add-song`；或加 `--add-unknown` 自动登记 |
| ? イベントを特定できない | 无法唯一确定对应的活动 | 在生成的 `setlist-map.json` 中填写活动 ID（或 `"skip"`）后重新运行 |

`setlist-map.json` 生成在 JSON 文件所在的目录，可以用 `--map` 指定其它位置。键为推文 ID（一条推文包含多部时为 `推文ID#部`）。

## 推文与活动的对应规则

1. 只考虑推文发布时**已经开演**的活动（因此 1部・2部 能自然区分）
2. 推文开头几行写有日期（`10/4`、`2026.10.04` 等）时只看那一天；否则优先发布当天，当天没有则看前一天
3. 一条推文中有【1部】【2部】等多个部时，拆分后分别对应
4. 仍有多个候选时，用推文中的 #话题标签 与活动名对照（所有候选都包含的标签不参与判断）
5. 编号接续（上一条最后是 M8，下一条从 M9 开始）且间隔 20 分钟以内的推文视为同一份歌单
6. 仍无法确定的不会自动猜测，交给 `setlist-map.json` 手动指定
