import { parseArgs } from "node:util";
import { addSetlist } from "./commands/add-setlist.ts";
import { applyEdit } from "./commands/apply-edit.ts";
import { song } from "./commands/song.ts";
import { siteChanges } from "./commands/site-changes.ts";
import { analytics } from "./commands/analytics.ts";
import { errors } from "./commands/errors.ts";
import { importComment } from "./commands/import-comment.ts";
import { importOfficial } from "./commands/import-official.ts";
import { importSetlists } from "./commands/import-setlists.ts";
import { importWikipedia } from "./commands/import-wikipedia.ts";
import { importYoutube } from "./commands/import-youtube.ts";
import { listEvents } from "./commands/list-events.ts";
import { ogPages } from "./commands/og-pages.ts";
import { openSetlistIssues } from "./commands/open-setlist-issues.ts";
import { replyIssues } from "./commands/reply-issues.ts";
import { sync } from "./commands/sync.ts";
import { validate } from "./commands/validate.ts";
import { watchX } from "./commands/watch-x.ts";
import { xWebhook } from "./commands/x-webhook.ts";

const USAGE = `usage: pnpm lm <command> <artistId> [options]

commands:
  sync               eventernote から events.json を更新（artistId に all で全アーティスト）
                     開催から 30 日を過ぎたイベントは確定扱いで再取得しない
                     --full             since まで全件取り直す
                     --frozen-days <n>  確定扱いにする日数（既定 30）
                     --dry-run
  list-events        種別・出演メンバー判定後のイベント一覧を表示
                     --type <eventType>
  add-setlist        公式 X のセトリ告知文（標準入力）から setlists/<eventId>.yaml を作成
                     --event <id> | --date <YYYY-MM-DD>
                     --source <ポストURL>  --file <path>
                     --add-unknown  songs.json に無い曲を自動追加
                     --force        既存ファイルを上書き
  import-setlists    tools/x-setlist-collector.js で集めたポスト（JSON）からセトリを一括登録
                     --file <tweets.json>  (必須)
                     --map <map.json>      手動の対応表（既定: tweets.json と同じ場所の setlist-map.json）
                     --dry-run --add-unknown --force
  open-setlist-issues 当日（と直近の取りこぼし）のライブごとにセトリ入力用 Issue を作成（GitHub Actions 用）
                     --date <YYYY-MM-DD>  --catch-up-days <n>（既定 7）  --dry-run
  import-comment     Issue コメントのセトリ告知を取り込む（GitHub Actions 用、artistId 不要）
                     --issue <Issue本文> --file <コメント> --out <返信本文の出力先>
  watch-x            公式 X のポストからセトリ告知を自動で取り込む（GitHub Actions 用、artistId に all 可）
                     セトリ待ちのイベントがあるときだけ X API を読む。X_BEARER_TOKEN 環境変数が必要
                     X_WEBHOOK_ID があれば Webhook の購読をイベントに合わせて開く・閉じる
                     --state <path>       前回までに読んだポスト（次回に引き継ぐ）  (必須)
                     --out <path>         Issue への返信の出力先（reply-issues に渡す）  (必須)
                     --commit-msg <path>  取り込んだときのコミットメッセージの出力先
                     --now <ISO 日時>     現在時刻の代わり（確認用）
                     --dry-run            書き込まない。キャッシュと登録済みのセトリを無視する（--now と組み合わせて確認）
  x-webhook          X の Webhook（/api/x-webhook）の登録・確認。artistId の位置に操作を書く（X_BEARER_TOKEN が必要）
                     list | register --url <url> | revalidate --id <id> | delete --id <id>
  reply-issues       watch-x の返信をセトリ入力用 Issue にコメントする（GitHub Actions 用、artistId 不要）
                     --file <actions.json>
  apply-edit         入力画面から送られたセトリ（JSON）を確かめて書き込む（GitHub Actions 用、artistId 不要）
                     --file <payload.json>  --commit-msg <path>
  validate           データ全体の整合性チェック（artistId に all 可）
                     --missing      セトリ未入力の終了済みイベントと、出典（source）の無いセトリを一覧表示
  import-official    公式サイトのディスコグラフィから songs.json を更新（公式の値を優先）
                     --dry-run      書き込まずに結果を表示
  import-wikipedia   Wikipedia のディスコグラフィから songs.json を補完（空き項目のみ）
                     --era <eraId>  新規追加曲の era を固定（省略時は発売日から判定）
                     --file <path>  ローカルの wikitext を使う
                     --dry-run
  import-youtube     公式 YouTube の MV・ライブ映像・Dance Practice・歌割動画を songs.json の videos に追加
                     yt-dlp を使う（PATH に無ければ uvx yt-dlp）。登録済みの動画は飛ばす
                     --dry-run
  og-pages           ビルド結果にページごとの共有カード（<path>.html と og/…png）を追加（artistId に all 可）
                     SITE_URL 環境変数が必要。画像はローカルの Google Chrome で描画
                     --dist <dir>     ビルド結果（既定 apps/web/dist）
                     --skip-images    HTML だけ作る
                     --only <文字列>  画像をパスに含むものだけ描画（確認用）
  site-changes       公開サイトのデプロイが要るか（下書きのグループのデータだけの変更なら不要）
                     --since <デプロイ済みのコミット>   GITHUB_OUTPUT に deploy=true/false
  song               曲を登録する・直す：pnpm lm song <artistId> <曲名|id> [options]
                     --new            新しく登録（無いときに打ち間違いで別の曲ができないよう必須）
                     --credits "編曲：X"  (書いた役割だけ上書き)
                     --release-date / --release-title / --release-kind
                     --cover <原曲アーティスト> --cover-title --cover-release-date --cover-release-title
                     --tieup "anime|作品名|オープニングテーマ"  (複数可)
                     --alias <別表記> (複数可) --note --era --unit --rename <新しい曲名>
                     --unset <項目>  (複数可。credits.arrangement・release・tieups など)
                     --dry-run        変更を表示するだけ
  errors             ブラウザで起きたエラー（/api/errors の記録）を、同じものをまとめて表示（artistId は all）
                     wrangler login 済みの Cloudflare アカウントから読む
                     --days <n>       直近何日分か（既定 7）
  analytics          サイトの訪問の記録（Cloudflare Web Analytics）：日ごとの訪問・よく見られたページ・流入元・端末・表示の速さ（artistId は all）
                     環境変数 CLOUDFLARE_ANALYTICS_TOKEN のトークンで読む（作り方は docs/maintenance.md）
                     --days <n>       直近何日分か（既定 14、最大 31）
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    era: { type: "string" },
    file: { type: "string" },
    "dry-run": { type: "boolean" },
    new: { type: "boolean" },
    title: { type: "string" },
    cover: { type: "string" },
    unit: { type: "string" },
    credits: { type: "string" },
    alias: { type: "string", multiple: true },
    tieup: { type: "string", multiple: true },
    unset: { type: "string", multiple: true },
    rename: { type: "string" },
    since: { type: "string" },
    "release-date": { type: "string" },
    "release-title": { type: "string" },
    "release-kind": { type: "string" },
    "cover-title": { type: "string" },
    "cover-release-date": { type: "string" },
    "cover-release-title": { type: "string" },
    note: { type: "string" },
    type: { type: "string" },
    full: { type: "boolean" },
    "frozen-days": { type: "string" },
    event: { type: "string" },
    date: { type: "string" },
    source: { type: "string" },
    "add-unknown": { type: "boolean" },
    force: { type: "boolean" },
    missing: { type: "boolean" },
    map: { type: "string" },
    issue: { type: "string" },
    out: { type: "string" },
    "catch-up-days": { type: "string" },
    dist: { type: "string" },
    "skip-images": { type: "boolean" },
    only: { type: "string" },
    days: { type: "string" },
    state: { type: "string" },
    "commit-msg": { type: "string" },
    now: { type: "string" },
    url: { type: "string" },
    id: { type: "string" },
  },
});
const [command, artistId] = positionals;

type Command = (id: string, opts: Record<string, any>) => Promise<void>;
/** artistId を取らないコマンド（対象は引数のファイルなどから決まる） */
const NO_ARTIST = new Set(["import-comment", "apply-edit", "reply-issues", "site-changes"]);
const commands: Record<string, Command> = {
  sync,
  "list-events": listEvents,
  "add-setlist": addSetlist,
  "import-setlists": importSetlists,
  validate,
  "import-official": importOfficial,
  "import-wikipedia": importWikipedia,
  "import-youtube": importYoutube as Command,
  song,
  "site-changes": siteChanges,
  "open-setlist-issues": openSetlistIssues,
  "import-comment": importComment as Command,
  "apply-edit": applyEdit as Command,
  "watch-x": watchX,
  "reply-issues": replyIssues as Command,
  "x-webhook": xWebhook,
  "og-pages": ogPages,
  errors,
  analytics,
};

const run = command ? commands[command] : undefined;
if (!run || (!artistId && !NO_ARTIST.has(command!))) {
  console.error(USAGE);
  process.exit(1);
}
try {
  // artistId の後ろの引数（song の曲名など）
  await run(artistId!, { ...values, args: positionals.slice(2) });
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
