import { parseArgs } from "node:util";
import { addSetlist } from "./commands/add-setlist";
import { addSong } from "./commands/add-song";
import { importOfficial } from "./commands/import-official";
import { importWikipedia } from "./commands/import-wikipedia";
import { listEvents } from "./commands/list-events";
import { sync } from "./commands/sync";
import { validate } from "./commands/validate";

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
  validate           データ全体の整合性チェック（artistId に all 可）
                     --missing      セトリ未入力の終了済みイベントを一覧表示
  import-official    公式サイトのディスコグラフィから songs.json を更新（公式の値を優先）
                     --dry-run      書き込まずに結果を表示
  import-wikipedia   Wikipedia のディスコグラフィから songs.json を補完（空き項目のみ）
                     --era <eraId>  新規追加曲の era を固定（省略時は発売日から判定）
                     --file <path>  ローカルの wikitext を使う
                     --dry-run
  add-song           曲を 1 曲追加（カバー曲・未発売曲など）
                     --title <曲名>  (必須)
                     --cover <原曲アーティスト>
                     --unit <unitId> --era <eraId>
                     --credits "作詞：A　作曲・編曲：B"
                     --alias <別表記>  (複数可)
                     --note <メモ>
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    era: { type: "string" },
    file: { type: "string" },
    "dry-run": { type: "boolean" },
    title: { type: "string" },
    cover: { type: "string" },
    unit: { type: "string" },
    credits: { type: "string" },
    alias: { type: "string", multiple: true },
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
  },
});
const [command, artistId] = positionals;

type Command = (id: string, opts: Record<string, any>) => Promise<void>;
const commands: Record<string, Command> = {
  sync,
  "list-events": listEvents,
  "add-setlist": addSetlist,
  validate,
  "import-official": importOfficial,
  "import-wikipedia": importWikipedia,
  "add-song": addSong,
};

const run = command ? commands[command] : undefined;
if (!run || !artistId) {
  console.error(USAGE);
  process.exit(1);
}
try {
  await run(artistId, values);
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
