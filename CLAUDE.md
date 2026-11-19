# CLAUDE.md

太陽と踊れ月夜に唄え（Second Season）のセトリ記録・集計サイト「ラブリィメモリー」（https://lovely-memory.moe/）。
设计见 [docs/design.md](docs/design.md)，日常维护见 [docs/maintenance.md](docs/maintenance.md)。这里只写容易踩坑的约定。

## 常用命令

```sh
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test   # 提交前
pnpm build && pnpm smoke             # 用 Chrome 打开全部页面（CI 和 deploy 都会跑）
pnpm format                          # oxfmt（artists/、Markdown、CSS、HTML 不格式化）
pnpm lm validate all                 # 数据检查
pnpm lm errors all [--days 7]        # 线上浏览器报的错误（D1，需要 wrangler login）
pnpm visual shoot <dir> / pnpm visual compare <前> <后> <差异>   # 截图逐像素对比
```

## Git（公开仓库）

- **不要用 `git add -A` / `git add .`**。先看 `git status`，只 add 自己改的文件（曾把 `.wrangler/` 的本地数据提交进去过）。
- 本地工具（wrangler、playwright 等）产生的目录要确认在 `.gitignore` 里，临时文件放仓库外。
- 推送前 `git fetch && git rebase origin/main`：「Sync events」「Import setlist」workflow 会直接往 main 提交。
- push 到 main 就会部署（`deploy.yml` 先跑全部检查，失败则不部署）。`ci.yml` 只在 PR 上跑。

## 代码

- Node 26 直接运行 `.ts`（类型擦除）：**只能用可擦除的语法**（不能用 enum、namespace、构造函数参数属性），相对 import 要写 `.ts` 扩展名。
- 浏览器端从 `@lovely-memory/core/runtime` 引入（不含 zod）；zod 只在构建和 CLI 里用。
- 异步的事件处理函数写成 `onClick={() => void f()}`（oxlint 的 no-misused-promises）。
- 「已举行」统一用 `heldCheck(today, setlistEventIds)`：日期在今天之前，或者是今天且已录入歌单。不要自己用日期比较。
- **页面在构建时预渲染**（`scripts/prerender.ts`），浏览器端接管（hydrate）。所以组件渲染时：
  - 不要直接用 `window`・`document`・`localStorage`・`navigator`・`location`・`matchMedia`（构建时没有）；要在 effect／事件处理里用，或者用 `src/hydration.ts` 的 `useHydrated()`・`useOrigin()`。
  - 「今天」用 `useArtistData().today`（不要调用 `todayJst()`）；网址参数用 `useSearchParamsAfterHydration()`。
  - 手机／电脑的不同布局两种都输出，用 `.only-narrow`／`.only-wide` 切换（不要用 JS 判断宽度）。
  - 接管时内容不一致，smoke 会以「エラーの報告が送られた」报出来（列出页面，并提示是 hydrate 不一致）。
- 界面文字和代码注释用日语；`docs/` 用中文。
- 用语：活动一律叫「イベント」，不用「公演」（リリイベ・fes 不叫公演；种别名「単独公演」除外）。计数用「回」「件」：「3 回連続」「5 回ぶり」「参戦 8 回」「今後のイベント 5 件」；歌唱率的分母写「12/20 イベント」；组合的通算是「通算 25 回目のイベント」（「通算 N 回目」是曲的）。
- 参戦記録只存在浏览器的 localStorage，不发送到服务器（错误上报也不包含它）。

## CSS

- 全站共用的在 `apps/web/src/styles/`（`main.tsx` 引入），只属于某个页面或组件的放在它的 `.tsx` 旁边、由它引入。
- 颜色・字号・圆角・阴影只用 `styles/tokens.css` 的变量；间距只用 0・2・4・6・8・10・12・16・20・24・32・64px（stylelint 检查）。
- 文字颜色要满足 4.5:1 对比度（橙色文字用 `--accent-text`，橙底用 `--accent-fill` + `--on-accent-fill`）。
- 不应改变外观的改动（重构等），改动前后用 `pnpm visual` 截图对比；有意改外观时，把变化的截图给用户确认。

## 数据

- `artists/<id>/` 下的 JSON / YAML 由 CLI 生成或更新，不要用格式化工具改。改完跑 `pnpm lm validate all`。
- 歌单导入只认仓库所有者在 Issue 里的评论。

## 部署・密钥

- Cloudflare Pages（`apps/web/wrangler.toml` 是项目配置的正本，D1 绑定也在这里）。
- **不要把 Cloudflare 的 token、account ID 打到 Actions 的公开日志里**。secret 由用户自己设置。
